// Runner board: each day, pick the 5–10 young graduates most likely to go on a $1.5M+ run, freeze the picks, and score
// them later against what actually happened. Rule registered 2026-10-17 from a retrospective on 86 candidates in which
// no feature separated the doublers from the rest; the rule is therefore simple, written down, and judged prospectively
// against a random draw from the same candidate set. Until the scorecard says otherwise the list is a watch set, not a
// forecast with demonstrated skill.
//
// Eligibility (hard filters, all must hold at pick time)
//   graduated to PumpSwap · token age 2–8 h · market cap $100k–$750k · pool ≥ $20k · not in any reject bucket ·
//   creator not a known rugger · has not already printed the target.
// Rank: a 0–100 composite of volume acceleration, buy pressure, strength vs migration and vs tracked peak, pool depth
//   relative to market cap, organic profile; penalties for paid boosts, vertical 1h moves, and sellers dominating.
// Targets: primary = market cap ≥ $1.5M within 48 h of the pick; secondary = 2× pick-time market cap within 24 h.
// Baselines frozen at the same moment from the same eligible set: random draw, top by market cap, top by 1h volume.
import { EventEmitter } from 'node:events';
import { config } from '../config.js';
import { db } from '../db.js';
import { logger } from '../log.js';
import { round } from '../util.js';
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
import { isGradRejected } from './rejects.js';

const log = logger('runners');
const R = config.runners;
const HOUR = 3600000;

db.exec(`CREATE TABLE IF NOT EXISTS runner_picks (
  id INTEGER PRIMARY KEY, day TEXT NOT NULL, ts INTEGER NOT NULL, book TEXT NOT NULL, rank INTEGER NOT NULL,
  mint TEXT NOT NULL, symbol TEXT, name TEXT, score REAL, mcap REAL, liq REAL, age_h REAL, price REAL,
  reasons TEXT, flags TEXT, features TEXT, late INTEGER DEFAULT 0,
  peak24 REAL, low24 REAL, peak48 REAL, labeled24 INTEGER DEFAULT 0, labeled48 INTEGER DEFAULT 0,
  hit_target INTEGER, x2_24h INTEGER, halved_24h INTEGER, UNIQUE(day, book, mint));
CREATE INDEX IF NOT EXISTS idx_rp_day ON runner_picks(day, book);
CREATE INDEX IF NOT EXISTS idx_rp_label ON runner_picks(labeled48, ts);`);

const SQL = {
  ins: (`INSERT OR IGNORE INTO runner_picks (day, ts, book, rank, mint, symbol, name, score, mcap, liq, age_h, price, reasons, flags, features, late)
    VALUES (@day, @ts, @book, @rank, @mint, @symbol, @name, @score, @mcap, @liq, @ageH, @price, @reasons, @flags, @features, @late)`),
  dayPicks: ('SELECT * FROM runner_picks WHERE day = ? ORDER BY book, rank'),
  hasDay: ("SELECT COUNT(*) n FROM runner_picks WHERE day = ? AND book = 'rule'"),
  unlabeled: ('SELECT * FROM runner_picks WHERE labeled48 = 0 AND ts < ? ORDER BY ts LIMIT 400'),
  future: ('SELECT ts, mcap FROM grad_snapshots WHERE mint = ? AND ts > ? AND ts <= ? ORDER BY ts'),
  label24: ('UPDATE runner_picks SET peak24 = ?, low24 = ?, labeled24 = 1, x2_24h = ?, halved_24h = ? WHERE id = ?'),
  label48: ('UPDATE runner_picks SET peak48 = ?, labeled48 = 1, hit_target = ? WHERE id = ?'),
  all: ('SELECT * FROM runner_picks ORDER BY ts DESC, book, rank'),
  days: (`SELECT day, MIN(ts) ts, SUM(book='rule') picks, SUM(CASE WHEN book='rule' AND labeled48=1 THEN 1 ELSE 0 END) scored48,
    SUM(CASE WHEN book='rule' AND hit_target=1 THEN 1 ELSE 0 END) hits, SUM(CASE WHEN book='rule' AND x2_24h=1 THEN 1 ELSE 0 END) x2,
    SUM(CASE WHEN book='random' AND hit_target=1 THEN 1 ELSE 0 END) rnd_hits, SUM(CASE WHEN book='random' AND x2_24h=1 THEN 1 ELSE 0 END) rnd_x2,
    SUM(CASE WHEN book='random' AND labeled48=1 THEN 1 ELSE 0 END) rnd_scored FROM runner_picks GROUP BY day ORDER BY day DESC LIMIT 60`),
  token: ('SELECT created_at, creator FROM tokens WHERE mint = ?'),
  curveRejected: ("SELECT 1 FROM rejects WHERE mint = ? AND kind = 'curve' LIMIT 1"),
  peakEver: ('SELECT MAX(mcap) m FROM grad_snapshots WHERE mint = ?'),
  kvGet: ('SELECT v FROM kv WHERE k = ?'), kvSet: ('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'),
};
// Prepared lazily: other modules (graduates, rejects) create some of these tables at import, and import order must not matter on a fresh database.
const Q = new Proxy({}, { get: (c, k) => (c[k] ||= db.prepare(SQL[k])) });

const localParts = (ts = Date.now()) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: config.telegram.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(ts).map((p) => [p.type, p.value]));
export const localDay = (ts = Date.now()) => { const p = localParts(ts); return `${p.year}-${p.month}-${p.day}`; };

/** Deterministic pseudo-random for the baseline draw: seeded by the day so a restart does not redraw. */
function seeded(day) { let h = 2166136261; for (const c of day) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }

/** Rank one eligible graduate. Pure: given the state's features, returns {score, parts, reasons, flags}. */
export function rankFeatures(f, { boosts = 0 } = {}) {
  const parts = {};
  parts.momentum = 25 * clamp(Math.log2(Math.max(f.volAccel ?? 0, 1e-3)) / 2);                 // 4× hourly pace = full marks
  parts.activity = 10 * clamp(Math.log2(Math.max(f.txAccel ?? 0, 1e-3)) / 2);
  parts.demand = 15 * clamp(((f.buyRatio1h ?? 0.5) - 0.5) / 0.15);                              // 65% buys over the hour = full
  parts.strength = (f.fromPeak != null ? 10 * clamp((f.fromPeak - 0.5) / 0.4) : 5) + (f.vsMig != null ? 10 * clamp((f.vsMig - 1) / 2) : 5); // near its peak, well above migration
  const liqShare = f.mcapUsd > 0 ? (f.liqUsd || 0) / f.mcapUsd : 0;
  parts.depth = 15 * clamp(liqShare / 0.15);                                                     // pool ≥ 15% of market cap = full
  parts.organic = (f.hasProfile ? 4 : 0) + Math.min(4, f.socials || 0) + (f.hasSite ? 2 : 0);
  if (f.liqTrend != null) parts.depth += 5 * clamp((f.liqTrend - 1) / 0.25);
  if (boosts > 0) parts.paid = -6;                                                               // paid attention; doublers had fewer boosts in the retrospective
  if (f.c1h != null && f.c1h > 150) parts.vertical = -12; else if (f.c1h != null && f.c1h > 80) parts.vertical = -6;
  if ((f.tx5 || 0) >= 15 && (f.buyRatio5 ?? 0.5) < 0.42) parts.sellers = -8;
  if (f.fdvLiq != null && f.fdvLiq > 20) parts.thin = -6;
  const score = round(clamp(Object.values(parts).reduce((a, b) => a + b, 0), 0, 100), 1);
  const reasons = [], flags = [];
  if ((f.volAccel ?? 0) >= 1.5) reasons.push(`volume ${round(f.volAccel, 1)}× hourly pace`);
  if ((f.buyRatio1h ?? 0) >= 0.58) reasons.push(`${round(f.buyRatio1h * 100, 0)}% buys over 1h`);
  if (f.vsMig != null && f.vsMig >= 2) reasons.push(`${round(f.vsMig, 1)}× migration price`);
  if (f.fromPeak != null && f.fromPeak >= 0.85) reasons.push('holding near its peak');
  if (liqShare >= 0.12) reasons.push(`pool ${round(liqShare * 100, 0)}% of market cap`);
  if ((f.socials || 0) >= 2 || f.hasSite) reasons.push('socials and site present');
  if (boosts > 0) flags.push(`paid DexScreener boost (${boosts})`);
  if (parts.vertical) flags.push(`already +${round(f.c1h, 0)}% in 1h`);
  if (parts.sellers) flags.push('sellers dominate last 5 min');
  if (parts.thin) flags.push(`FDV ${round(f.fdvLiq, 0)}× liquidity`);
  if (f.fromPeak != null && f.fromPeak < 0.6) flags.push(`${round((1 - f.fromPeak) * 100, 0)}% below tracked peak`);
  return { score, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, round(v, 1)])), reasons, flags };
}

export class Runners extends EventEmitter {
  constructor({ grads }) { super(); this.grads = grads; this.live = []; this.liveAt = 0; this.excluded = {}; this.timer = null; }

  start() { this.timer = setInterval(() => this.tick(), 60000); setTimeout(() => this.tick(), 20000); }

  /** Why a watched graduate is not eligible, or null if it is. */
  ineligible(st, now = now_()) {
    const f = st.features, L = st.last; if (!f || !L) return 'no data yet';
    const tok = Q.token.get(st.mint);
    const born = tok?.created_at || st.pairCreatedAt || st.addedAt; const ageH = (now - born) / HOUR;
    if (ageH < R.minAgeH) return 'younger than window';
    if (ageH > R.maxAgeH) return 'older than window';
    if (!(L.mcap >= R.minMcapUsd)) return 'market cap below floor';
    if (L.mcap > R.maxMcapUsd) return 'market cap above ceiling';
    if (!(L.liq >= R.minLiqUsd)) return 'pool too small';
    if (st.reject) return `graduate reject: ${st.reject}`;
    if (isGradRejected(st.mint) || Q.curveRejected.get(st.mint)) return 'in a reject bucket';
    if (st.creatorRugger) return 'creator is a known rugger';
    if ((Q.peakEver.get(st.mint)?.m || 0) >= R.targetMcapUsd) return 'already printed the target';
    return null;
  }

  /** Build the live board from the graduate watchlist. */
  build() {
    const now = Date.now(), rows = [], ex = {};
    for (const st of this.grads.watch.values()) {
      const why = this.ineligible(st, now);
      if (why) { const k = why.split(':')[0]; ex[k] = (ex[k] || 0) + 1; continue; }
      const f = st.features, tok = Q.token.get(st.mint);
      const born = tok?.created_at || st.pairCreatedAt || st.addedAt;
      const r = rankFeatures(f, { boosts: st.info?.boosts || 0 });
      rows.push({ mint: st.mint, symbol: st.symbol, name: st.name, score: r.score, parts: r.parts, reasons: r.reasons, flags: r.flags,
        mcap: st.last.mcap, liq: st.last.liq, price: st.last.price, ageH: round((now - born) / HOUR, 2), vol1h: st.last.v1h || 0, vsMig: f.vsMig, gradScore: st.score, features: f });
    }
    rows.sort((a, b) => b.score - a.score || b.vol1h - a.vol1h);
    this.live = rows; this.liveAt = now; this.excluded = ex;
    return rows;
  }

  /** Freeze today's picks once the local pick hour has passed. Late (catch-up) picks are flagged. */
  maybePick() {
    const p = localParts(), day = `${p.year}-${p.month}-${p.day}`, hour = Number(p.hour);
    if (hour < R.pickHour || Q.hasDay.get(day).n > 0) return null;
    const elig = this.build();
    if (elig.length < R.minEligible) { if (!this._warnedDay || this._warnedDay !== day) { log.info(`${day}: only ${elig.length} eligible, waiting (need ${R.minEligible})`); this._warnedDay = day; } if (hour < 23) return null; }
    const k = Math.min(R.picks, elig.length), ts = Date.now(), late = hour > R.pickHour ? 1 : 0;
    const save = (book, list) => list.forEach((x, i) => Q.ins.run({ day, ts, book, rank: i + 1, mint: x.mint, symbol: x.symbol, name: x.name, score: x.score, mcap: x.mcap, liq: x.liq, ageH: x.ageH, price: x.price,
      reasons: JSON.stringify(x.reasons), flags: JSON.stringify(x.flags), features: JSON.stringify(x.features), late }));
    const rule = elig.slice(0, k);
    const rnd = seeded(day), shuffled = [...elig].sort(() => rnd() - 0.5).slice(0, k);
    const byMcap = [...elig].sort((a, b) => b.mcap - a.mcap).slice(0, k);
    const byVol = [...elig].sort((a, b) => b.vol1h - a.vol1h).slice(0, k);
    const tx = db.transaction(() => { save('rule', rule); save('random', shuffled); save('mcap', byMcap); save('vol', byVol); });
    tx();
    log.info(`${day}: froze ${k} picks from ${elig.length} eligible${late ? ' (late)' : ''} · #1 ${rule[0]?.symbol} score ${rule[0]?.score}`);
    const out = { day, ts, late, eligible: elig.length, picks: rule, k };
    this.emit('picks', out);
    return out;
  }

  /** Outcomes from the graduate snapshots that follow each pick. A token that stops being watched is dead for our purposes: no hit. */
  label() {
    const now = Date.now();
    for (const r of Q.unlabeled.all(now - 24 * HOUR)) {
      if (!r.labeled24) {
        const s24 = Q.future.all(r.mint, r.ts, r.ts + 24 * HOUR);
        const peak24 = s24.length ? Math.max(...s24.map((x) => x.mcap)) : r.mcap, low24 = s24.length ? Math.min(...s24.map((x) => x.mcap)) : r.mcap;
        Q.label24.run(peak24, low24, peak24 >= 2 * r.mcap ? 1 : 0, low24 <= 0.5 * r.mcap ? 1 : 0, r.id);
      }
      if (now - r.ts >= 48 * HOUR) {
        const s48 = Q.future.all(r.mint, r.ts, r.ts + 48 * HOUR);
        const peak48 = s48.length ? Math.max(...s48.map((x) => x.mcap)) : r.mcap;
        Q.label48.run(peak48, peak48 >= R.targetMcapUsd ? 1 : 0, r.id);
      }
    }
  }

  tick() { try { this.build(); this.maybePick(); this.label(); } catch (e) { log.warn('tick', e.stack || e.message); } }

  /** Scorecard: precision of the rule's picks vs the baselines, with Wilson intervals. */
  scorecard() {
    const rows = Q.all.all(), books = ['rule', 'random', 'mcap', 'vol'], out = {};
    const wilson = (k, n) => { if (!n) return null; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), s = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return { lo: round(((c - s) / d) * 100, 1), hi: round(((c + s) / d) * 100, 1) }; };
    for (const b of books) {
      const rs = rows.filter((r) => r.book === b), l48 = rs.filter((r) => r.labeled48), l24 = rs.filter((r) => r.labeled24);
      const hits = l48.filter((r) => r.hit_target).length, x2 = l24.filter((r) => r.x2_24h).length, halved = l24.filter((r) => r.halved_24h).length;
      out[b] = { picks: rs.length, scored48: l48.length, hits, hitPct: l48.length ? round((hits / l48.length) * 100, 1) : null, hitCi: wilson(hits, l48.length),
        scored24: l24.length, x2, x2Pct: l24.length ? round((x2 / l24.length) * 100, 1) : null, x2Ci: wilson(x2, l24.length), halvedPct: l24.length ? round((halved / l24.length) * 100, 1) : null,
        medianPeakMult: l24.length ? round(l24.map((r) => r.peak24 / r.mcap).sort((a, c) => a - c)[l24.length >> 1], 2) : null };
    }
    return { books: out, days: Q.days.all(), target: R.targetMcapUsd };
  }

  dayView(day) {
    const rows = Q.dayPicks.all(day).map((r) => ({ ...r, reasons: JSON.parse(r.reasons || '[]'), flags: JSON.parse(r.flags || '[]'), features: undefined,
      nowMcap: this.grads.watch.get(r.mint)?.last?.mcap ?? null }));
    return { day, rows };
  }

  view() {
    if (Date.now() - this.liveAt > 120000) this.build();
    const today = localDay(), todays = this.dayView(today);
    return { config: { ...R, timezone: config.telegram.timezone }, liveAt: this.liveAt, eligible: this.live.length, excluded: this.excluded,
      live: this.live.slice(0, 20).map(({ features, ...x }) => x), today: todays, scorecard: this.scorecard(), watched: this.grads.watch.size };
  }
}
const now_ = () => Date.now();
