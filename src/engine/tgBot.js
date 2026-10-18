// Two-way Telegram: send the bot a mint address or a pump.fun / dexscreener link and it answers with what Curvewatch knows.
//
// The reply is a data card, the same for everyone, built only from data the dashboard already shows: live state, the score
// and its reasons, the sticky-reject verdict, the base rates for similar snapshots, this machine's paper record on the token,
// and the current PumpSwap pool if it graduated. It never says buy, sell, or when; every card ends with the disclosure.
// Only chats in the allowlist (TELEGRAM_CHAT_ID, TELEGRAM_STRONG_CHAT_ID) are answered; everyone else is ignored.
import { config } from '../config.js';
import { db } from '../db.js';
import { logger } from '../log.js';
import { market, fmtUsd } from '../market.js';
import { esc, notify, tgEnabled } from './telegram.js';
import { TELEGRAM_FOOTER } from '../compliance.js';
import { calibration } from '../stats.js';
import { categoryOf, isGradRejected } from './rejects.js';

import { holdersOf, holdersEnabled } from './holders.js';
const log = logger('tgbot');
const T = config.telegram;
const MINT_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
const POLL_MS = 3000;

// Prepared lazily: the graduate tables are created by graduates.js, which may load after this module.
const SQL = {
  token: 'SELECT * FROM tokens WHERE mint = ?',
  rejects: 'SELECT kind, reason, cat, first_ts FROM rejects WHERE mint = ? ORDER BY first_ts',
  snaps: 'SELECT checkpoint, ts, mcap, score, reject, max_mcap_after, graduated_after FROM snapshots WHERE mint = ? ORDER BY checkpoint',
  alerts: 'SELECT ts, score, mcap, max_multiple, graduated FROM alerts WHERE mint = ? ORDER BY ts DESC LIMIT 3',
  papers: "SELECT book, status, entry_ts, pnl_pct, exit_reason FROM paper_trades WHERE mint = ? ORDER BY entry_ts DESC LIMIT 6",
  gradPapers: "SELECT book, status, entry_ts, pnl_pct, exit_reason FROM grad_paper WHERE mint = ? ORDER BY entry_ts DESC LIMIT 6",
  gradWatch: 'SELECT * FROM grad_watch WHERE mint = ?',
  gradLast: 'SELECT ts, price, mcap, liq, score, reject FROM grad_snapshots WHERE mint = ? ORDER BY ts DESC LIMIT 1',
  gradAlerts: 'SELECT ts, score, mcap FROM grad_alerts WHERE mint = ? ORDER BY ts DESC LIMIT 3',
  tracked: 'SELECT COUNT(DISTINCT wallet) n FROM wallet_positions2 WHERE mint = ?',
  catRate: `SELECT COUNT(*) n, SUM(COALESCE(t.graduated,0)) g FROM rejects r LEFT JOIN tokens t ON t.mint = r.mint WHERE r.kind = 'curve' AND r.cat = ? AND r.first_ts > ? AND COALESCE(t.finalized,0) = 1`,
  acceptedRate: `SELECT COUNT(*) n, SUM(graduated) g FROM tokens t WHERE finalized = 1 AND created_at > ? AND NOT EXISTS (SELECT 1 FROM rejects r WHERE r.mint = t.mint AND r.kind = 'curve')`,
  gradRates: `SELECT COUNT(*) n, SUM(w.peak_price >= 1.5 * w.mig_price) up50, SUM(l.price <= 0.2 * w.mig_price) down80 FROM grad_watch w
    JOIN (SELECT mint, price, MAX(ts) ts FROM grad_snapshots GROUP BY mint) l ON l.mint = w.mint WHERE w.mig_price > 0 AND w.added_at < ?`,
  kv: 'SELECT v FROM kv WHERE k = ?', setKv: 'INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v',
};
const Q = new Proxy({}, { get: (c, k) => (c[k] ||= typeof SQL[k] === 'string' ? db.prepare(SQL[k]) : SQL[k]) });

const cache = new Map();
const cached = (k, f, ms = 600000) => { const h = cache.get(k); if (h && Date.now() - h.at < ms) return h.v; const v = f(); cache.set(k, { at: Date.now(), v }); return v; };
const WEEK = 7 * 86400000;
/** Graduation rate of coins rejected for this category vs accepted coins, last 7 days, finalized only. */
const rejectBaseRate = (cat) => cached(`rej:${cat}`, () => {
  const a = Q.catRate.get(cat, Date.now() - WEEK), b = Q.acceptedRate.get(Date.now() - WEEK);
  return { cat, n: a?.n || 0, rate: a?.n ? (a.g / a.n) * 100 : null, baseN: b?.n || 0, base: b?.n ? (b.g / b.n) * 100 : null };
});
/** What happened to graduates this machine watched: share that later traded at ≤20% of migration, share that peaked ≥ +50%. */
const gradBaseRates = () => cached('grad', () => { const r = Q.gradRates.get(Date.now() - 6 * 3600000); return { n: r?.n || 0, up50: r?.n ? (r.up50 / r.n) * 100 : null, down80: r?.n ? (r.down80 / r.n) * 100 : null }; });

const usd = (sol) => (market.solUsd && sol != null ? fmtUsd(sol * market.solUsd) : sol != null ? `${sol.toFixed(1)} SOL` : '–');
const pct = (v, d = 0) => (v == null ? '–' : `${v.toFixed(d)}%`);
const ago = (ts) => { const m = (Date.now() - ts) / 60000; return m < 1 ? 'just now' : m < 60 ? `${Math.round(m)} min ago` : m < 2880 ? `${(m / 60).toFixed(1)} h ago` : `${Math.round(m / 1440)} d ago`; };
const age = (sec) => (sec < 90 ? `${Math.round(sec)} s` : sec < 5400 ? `${Math.round(sec / 60)} min` : sec < 172800 ? `${(sec / 3600).toFixed(1)} h` : `${Math.round(sec / 86400)} d`);

export function extractMint(text) {
  if (!text) return null;
  const m = text.match(/(?:pump\.fun\/(?:coin\/)?|dexscreener\.com\/solana\/|solscan\.io\/token\/)([1-9A-HJ-NP-Za-km-z]{32,44})/);
  if (m) return m[1];
  const all = text.match(MINT_RE) || [];
  return all.find((s) => s.endsWith('pump')) || all.find((s) => s.length >= 43) || null;
}

/** The card. Pure given the engine and grads references; exported so tests can call it without Telegram. */
export function tokenCard(mint, { engine, grads, strong }) {
  const live = engine.getToken?.(mint), T0 = Q.token.get(mint), gw = Q.gradWatch.get(mint), gl = Q.gradLast.get(mint);
  const seen = !!(live || T0 || gw);
  const sym = live?.symbol || T0?.symbol || gw?.symbol || mint.slice(0, 4) + '…' + mint.slice(-4);
  const L = [`<b>${esc(sym)}</b>${T0?.name || live?.name ? ` · ${esc(T0?.name || live?.name)}` : ''}`, `<code>${mint}</code>`];
  if (!seen) {
    L.push('', 'Curvewatch has <b>no record</b> of this token. Either it launched while the collector was down, it is not a Pump.fun coin, or the address is wrong.',
      'Nothing can be said about it from here; the dashboard links below are the public data.');
    return finish(L, mint);
  }
  // ---- stage ----
  const grad = !!(T0?.graduated || live?.graduated || gw);
  const created = T0?.created_at || live?.createdAt;
  L.push('', `<b>Stage:</b> ${grad ? 'graduated to PumpSwap' : live ? 'on the bonding curve' : 'curve, no longer tracked live'}${created ? ` · launched ${ago(created)}` : ''}${T0?.graduated_at ? ` · graduated ${ago(T0.graduated_at)}` : ''}`);
  if (live && !grad) {
    const f = live.lastFeatures, s = live.lastScore;
    L.push(`<b>Now:</b> mcap ${usd(live.mcap)} · curve ${(live.progress * 100).toFixed(0)}% · ${live.buyers.size} buyers · ${live.trades.length} trades · age ${age(live.ageSec)}`);
    if (live.peakMcap) L.push(`Peak ${usd(live.peakMcap)} · drawdown from peak ${pct(f?.drawdownPct)}`);
    if (!live.quoteOk) L.push(`Quoted in ${live.quoteMint ? `<code>${live.quoteMint.slice(0, 6)}…</code>` : 'a non-SOL asset'}: market cap in USD is not computed for this curve.`);
    L.push('', `<b>Score:</b> ${s?.score != null ? s.score.toFixed(0) : '–'} / 100${s?.reject ? ` · <b>REJECTED</b>: ${esc(s.reject)}` : ''}`);
    if (s?.reasons?.length) L.push(`For: ${esc(s.reasons.slice(0, 4).join(' · '))}`);
    if (s?.flags?.length) L.push(`Against: ${esc(s.flags.slice(0, 4).join(' · '))}`);
    if (f) L.push(`Creator: ${f.creatorLaunches} launches, ${f.creatorGraduations} graduations, ${f.creatorRugs} rugs${f.creatorSold ? ' · <b>has sold</b>' : ''}${f.initialBuySol ? ` · dev buy ${f.initialBuySol.toFixed(2)} SOL` : ''}`,
      `Holders: top-10 hold ${pct(f.top10Pct)} · bundle ${pct(f.bundlePct)} (${f.bundleWallets} wallets) · smart wallets buying: ${f.smartBuyers}`);
  }
  // ---- sticky rejects ----
  const rej = Q.rejects.all(mint);
  if (rej.length) {
    L.push('', `<b>Rejects bucket:</b> ${rej.map((r) => `${r.kind === 'grad' ? 'post-grad' : 'curve'}: ${esc(r.reason)} [${esc(r.cat || categoryOf(r.reason))}, ${ago(r.first_ts)}]`).join(' · ')}`, 'Rejected coins get no alerts and no paper trades here.');
    const c = rej.find((r) => r.kind === 'curve'); const br = c ? rejectBaseRate(c.cat || categoryOf(c.reason)) : null;
    if (br?.n >= 20 && br.baseN) L.push(`Past 7 days: coins rejected for "${esc(br.cat)}" graduated ${pct(br.rate, 1)} of the time (${br.n} coins) vs ${pct(br.base, 1)} for accepted coins (${br.baseN}).${br.rate > br.base ? ' A higher graduation rate does not make a reject safe: these categories are where the rug and bundle exits live.' : ''}`);
  }
  else if (grad && isGradRejected(mint)) L.push('', '<b>Rejects bucket:</b> post-graduation reject on record.');
  // ---- base rates for this score ----
  const sc = live?.lastScore?.score ?? Q.snaps.all(mint).at(-1)?.score;
  if (sc != null && !grad) {
    const cal = calibration(120), b = cal.buckets.find((x) => { const [lo] = x.label.split('–').map(Number); return sc >= lo && sc < lo + 10; });
    if (b?.n) L.push('', `<b>Base rate, score ${b.label} at 2 min (${b.n} coins):</b> ${pct(b.hit2xPct)} reached 2× · ${pct(b.hit5xPct)} reached 5× · ${pct(b.gradPct, 1)} graduated · median peak ${b.medianMaxMult}×`);
    const h = strong?.history?.('curve', sc);
    if (h?.n) L.push(`Similar scores (±${config.strong.scoreBand}) hit +${config.strong.targetPct}% before −${config.strong.stopPct}% in <b>${pct(h.rate)}</b> of ${h.n} cases (95% low ${pct(h.lo)}). Coin flip is 50%; after costs the paper books on these are negative.`);
  }
  // ---- graduate state ----
  if (grad) {
    const st = grads?.watch?.get?.(mint), pt = st?.last, last = pt ? { mcap: pt.mcap, liq: pt.liq, price: pt.price, score: st.score, reject: st.reject, ts: pt.t } : gl;
    const mig = st?.migPrice || gw?.mig_price;
    if (last) L.push('', `<b>PumpSwap now:</b> mcap ${fmtUsd(last.mcap)} · pool ${fmtUsd(last.liq)}${mig && last.price ? ` · ${(last.price / mig).toFixed(2)}× migration price` : ''} · re-ignition score ${last.score != null ? Number(last.score).toFixed(0) : '–'}${last.reject ? ` · rejected: ${esc(last.reject)}` : ''}${last.ts ? ` · as of ${ago(last.ts)}` : ''}`);
    if (gw && !gw.active) L.push(`No longer watched: ${esc(gw.dropped_reason || 'aged out')}.`);
    if (last?.liq != null && last.liq < config.grads.minLiqUsd) L.push(`Pool is under the ${fmtUsd(config.grads.minLiqUsd)} minimum this tool requires before it would even paper trade.`);
    const ga = Q.gradAlerts.all(mint); if (ga.length) L.push(`Re-ignition alerts: ${ga.map((a) => `${ago(a.ts)} at ${fmtUsd(a.mcap)} (score ${Number(a.score).toFixed(0)})`).join(', ')}`);
    const g = gradBaseRates(); if (g.n >= 50) L.push(`Of the ${g.n} graduates this machine has watched: ${pct(g.down80)} later traded at 20% or less of their migration price; ${pct(g.up50)} ever reached +50% above it.`);
  }
  // ---- this machine's record on the token ----
  const al = Q.alerts.all(mint), pp = [...Q.papers.all(mint), ...Q.gradPapers.all(mint)];
  if (al.length) L.push('', `<b>Curve alerts:</b> ${al.map((a) => `${ago(a.ts)} at ${usd(a.mcap)} (score ${Number(a.score).toFixed(0)}${a.max_multiple ? `, peak ${Number(a.max_multiple).toFixed(2)}× after` : ''})`).join('; ')}`);
  if (pp.length) L.push(`<b>Paper trades here:</b> ${pp.map((p) => `${p.book || 'grad'} ${p.status === 'closed' ? `${p.pnl_pct >= 0 ? '+' : ''}${Number(p.pnl_pct).toFixed(0)}% (${esc(p.exit_reason || '')})` : 'open'}`).join(' · ')}`);
  const tr = Q.tracked.get(mint)?.n || 0; if (tr) L.push(`Tracked smart wallets with a position: ${tr}`);
  return finish(L, mint);
}
function finish(L, mint) {
  L.push('', `<a href="https://pump.fun/coin/${mint}">pump.fun</a> · <a href="https://dexscreener.com/solana/${mint}">DexScreener</a> · <a href="https://solscan.io/token/${mint}">Solscan</a>`);
  // the footer is added by notify(); this line is specific to lookups
  L.push(`<i>Lookup card: facts this machine recorded, identical for anyone who asks. Not an entry recommendation.</i>`);
  return L.join('\n');
}

/** Conversational intents. Keyword-based on purpose: deterministic, testable, no model in the loop. */
export function intentOf(text) {
  const t = text.toLowerCase();
  if (/^\/(start|help)\b/.test(t)) return 'help';
  if (/^\/runners\b/.test(t)) return 'runners';
  if (/^\/status\b/.test(t) || /\b(status|how are (the )?(books|feeds)|collector)\b/.test(t)) return 'status';
  if (/^\/picks\b/.test(t)) return 'picks';
  const wantsRunner = /\b(runner|runners|potential|play|plays|watch ?list|tonight|session|heating|reignit\w*|picks?|what('s| is) (hot|moving|running)|top ?\d*)\b/.test(t);
  const wantsSoon = /\b(soon|about to|close to|near(ly)?|almost)\b.*\b(grad\w*|migrat\w*|bond\w*)|\bgrads?\b|\bgraduat\w*/.test(t);
  if (wantsRunner && wantsSoon) return 'picks';
  if (wantsRunner) return 'reignite';
  if (wantsSoon) return 'soon';
  if (/\b(holders?|holder count)\b/.test(t)) return 'holders';
  return null;
}

function pickLines(picks, kind, n) {
  const L = [];
  if (kind === 'reignite' || kind === 'both') {
    const r = picks.reigniting(n, { source: 'telegram' });
    L.push(`<b>Top ${n} graduates reigniting</b> · ${r.examined} clean graduates examined (pool ≥ $20k, ≤ 72 h, no rejects)`);
    L.push(...r.rows.map((x, i) => `${i + 1}. <b>${esc(x.symbol || x.mint.slice(0, 6))}</b> · ${fmtUsd(x.mcapUsd)} · pool ${fmtUsd(x.liqUsd)} · ${x.ageH} h · score ${x.score.toFixed(0)}${x.holders != null ? ` · ${x.holders.toLocaleString('en-US')} holders` : ''}${x.reasons.length ? `\n   ${esc(x.reasons.slice(0, 3).join(' · '))}` : ''}${x.flags.length ? `\n   ! ${esc(x.flags.slice(0, 2).join(' · '))}` : ''}\n   <code>${x.mint}</code>`));
    if (!r.rows.length) L.push('Nothing is reigniting right now: no clean graduate has volume above 1.2× its hourly pace or a breakout.');
    if (!r.holdersTracked) L.push('<i>Holder counts for graduates need HELIUS_API_KEY; without it the +2,500-holder filter cannot be applied.</i>');
  }
  if (kind === 'soon' || kind === 'both') {
    if (L.length) L.push('');
    const s = picks.soon(n, { source: 'telegram' });
    L.push(`<b>Top ${n} soon to be grads</b> · ${s.examined} live curves past 35% examined`);
    L.push(...s.rows.map((x, i) => `${i + 1}. <b>${esc(x.symbol || x.mint.slice(0, 6))}</b> · ${x.progressPct}% of curve · ${x.mcapUsd != null ? fmtUsd(x.mcapUsd) : `${x.mcapSol.toFixed(1)} SOL`} · ${x.uniqueBuyers} buyers · ${x.holders} holders · ${x.ageMin} min · score ${x.score.toFixed(0)}${x.flags.length ? `\n   ! ${esc(x.flags.slice(0, 2).join(' · '))}` : ''}\n   <code>${x.mint}</code>`));
    if (!s.rows.length) L.push('No live curve past 35% with buyers in the last 10 minutes and no reject.');
  }
  L.push('', '<i>Ranked watch lists over recorded data; served picks are logged and scored later. Base rates so far: real graduates lose 5–37% per 6 h in every band, and only 0.7% of curve signals ever reached +125%. Not entry recommendations.</i>');
  return L.join('\n');
}

const HELP = ['<b>Curvewatch bot</b>', 'Send a Pump.fun mint address or a pump.fun / DexScreener link and I reply with what Curvewatch has recorded about that token: stage, score and reasons, reject verdict, base rates for similar coins, pool state if it graduated, and this machine\'s paper record.',
  '', '/runners – the live runner board (young graduates ranked for a $1.5M+ run) and its scorecard', '/picks – top 5 graduates reigniting and top 5 soon to be grads (or just ask: "send me a potential runner for tonight", "what is about to graduate")', '/status – collector and books in one line', '/help – this message', '', 'Strong signals, graduate alerts and the daily summary arrive here automatically.'].join('\n');

export function startTgBot({ engine, grads, strong, status, runners, picks }) {
  if (!tgEnabled() || !T.botToken) return null;
  const allow = new Set([T.chatId, T.strongChatId].filter(Boolean).map(String));
  let offset = Number(Q.kv.get('tg_offset')?.v || 0), busy = false, failures = 0;
  const api = (m, body) => fetch(`https://api.telegram.org/bot${T.botToken}/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(35000) }).then((r) => r.json());
  const reply = (chat, html) => api('sendMessage', { chat_id: chat, text: `${html}\n<i>${TELEGRAM_FOOTER}</i>`, parse_mode: 'HTML', disable_web_page_preview: true });
  async function tick() {
    if (busy) return; busy = true;
    try {
      const r = await api('getUpdates', { offset, timeout: 20, allowed_updates: ['message'] });
      if (!r.ok) { failures++; if (failures % 20 === 1) log.warn(`getUpdates: ${r.description}`); return; }
      failures = 0;
      for (const u of r.result || []) {
        offset = u.update_id + 1; Q.setKv.run('tg_offset', String(offset));
        const msg = u.message; if (!msg?.text) continue;
        const chat = String(msg.chat.id);
        if (!allow.has(chat)) { log.info(`ignored message from chat ${chat}`); continue; }
        const text = msg.text.trim();
        const intent = intentOf(text);
        if (intent === 'help') { await reply(chat, HELP); continue; }
        if (intent && ['picks', 'reignite', 'soon', 'holders'].includes(intent)) {
          if (!picks) { await reply(chat, 'Pick lists unavailable.'); continue; }
          const n = Math.min(10, Math.max(3, Number((text.match(/top\s*(\d+)/i) || [])[1]) || 5));
          if (intent === 'holders') { const m = extractMint(text); const hc = m ? holdersOf(m) : null; await reply(chat, m ? (hc ? `<b>${m.slice(0, 8)}…</b> · ${hc.holders.toLocaleString('en-US')}${hc.capped ? '+' : ''} holders · counted ${Math.round(hc.ageMin)} min ago` : holdersEnabled() ? 'Not counted yet for that mint (graduates in the runner band are refreshed every few minutes).' : 'Holder counts for graduates need HELIUS_API_KEY on the server.') : 'Send a mint with the word holders, e.g. "holders &lt;mint&gt;".'); continue; }
          let out; try { out = pickLines(picks, intent === 'picks' ? 'both' : intent, n); } catch (e) { log.warn('picks', e.stack); out = `Could not build the lists: ${esc(e.message)}`; }
          await reply(chat, out); log.info(`picks (${intent}) for chat ${chat}`); continue;
        }
        if (intent === 'runners') {
          const v = runners?.view?.(); if (!v) { await reply(chat, 'Runner board unavailable.'); continue; }
          const top = v.live.slice(0, Math.min(10, v.live.length)), sc = v.scorecard.books;
          const L = [`<b>Runner board · live</b> · ${v.eligible} eligible now (graduated, ${v.config.minAgeH}–${v.config.maxAgeH} h old, ${fmtUsd(v.config.minMcapUsd)}–${fmtUsd(v.config.maxMcapUsd)}, pool ≥ ${fmtUsd(v.config.minLiqUsd)}, no rejects)`,
            ...top.map((x, i) => `${i + 1}. <b>${esc(x.symbol || x.mint.slice(0, 6))}</b> · ${fmtUsd(x.mcap)} · ${x.ageH.toFixed(1)} h · score ${x.score.toFixed(0)}${x.reasons.length ? ` · ${esc(x.reasons.slice(0, 2).join(', '))}` : ''}${x.flags.length ? ` · flag: ${esc(x.flags[0])}` : ''}`),
            top.length ? '' : 'Nothing eligible right now.',
            `Scorecard: rule ${sc.rule.hits}/${sc.rule.scored48} reached ${fmtUsd(v.config.targetMcapUsd)} in 48 h vs random ${sc.random.hits}/${sc.random.scored48}; doubled in 24 h: rule ${sc.rule.x2}/${sc.rule.scored24} vs random ${sc.random.x2}/${sc.random.scored24}. Today's frozen picks are on the dashboard.`];
          await reply(chat, L.join('\n')); continue;
        }
        if (intent === 'status') { const s = status?.(); await reply(chat, s ? `<b>Status</b> · ${s.feeds?.every((f) => f.healthy) ? 'feeds healthy' : 'a feed is unhealthy'} · ${s.engine?.tracked ?? '–'} tokens live · kill rule ${s.kill?.status || '–'} (${s.kill?.n ?? 0}/${s.kill?.needed ?? '–'}) · graduates ${s.gradKill?.status || '–'}` : 'status unavailable'); continue; }
        const mint = extractMint(text);
        if (!mint) { await reply(chat, 'Send a mint address (ends in <code>pump</code>) or a pump.fun / DexScreener link. /help for more.'); continue; }
        let card; try { card = tokenCard(mint, { engine, grads, strong }); } catch (e) { log.warn('card', e.stack); card = `Could not build a card for <code>${mint}</code>: ${esc(e.message)}`; }
        const res = await reply(chat, card);
        if (!res.ok) log.warn(`reply failed: ${res.description}`);
        log.info(`lookup ${mint.slice(0, 8)} from chat ${chat}`);
      }
    } catch (e) { failures++; if (failures % 20 === 1) log.warn(`poll: ${e.message}`); }
    finally { busy = false; }
  }
  const timer = setInterval(tick, POLL_MS); tick();
  log.info(`two-way bot on · answering ${allow.size} chat${allow.size === 1 ? '' : 's'}`);
  return { stop: () => clearInterval(timer) };
}
