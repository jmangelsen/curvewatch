// Conversational picks: intent parsing, the two ranking functions, the scale-out exit rule, and the holder module when no key is set.
import assert from 'node:assert/strict';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cwpk-'));
// A defined empty value blocks config's .env loader from refilling the key. `delete` makes it
// undefined, so a HELIUS_API_KEY in the environment or in ./.env turns holdersTracked back on.
process.env.HELIUS_API_KEY = '';
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.LOG_LEVEL = 'error';
await import('../src/engine/graduates.js');
const { intentOf } = await import('../src/engine/tgBot.js');
const { reigniteRank, soonRank, Picks } = await import('../src/engine/picks.js');
const { holdersEnabled, holdersOf, countHolders } = await import('../src/engine/holders.js');
const { STRATEGIES } = await import('../src/engine/paper.js');
const { db } = await import('../src/db.js');
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok', name); };

await t('intents: the user\'s phrasings land on the right list', () => {
  assert.equal(intentOf('send me a potential runner for tonight\'s session'), 'reignite');
  assert.equal(intentOf('top 5 potential grads reigniting and top 5 soon to be grads'), 'picks');
  assert.equal(intentOf('what is about to graduate?'), 'soon');
  assert.equal(intentOf('soon to be grads'), 'soon');
  assert.equal(intentOf('/picks'), 'picks');
  assert.equal(intentOf('/runners'), 'runners');
  assert.equal(intentOf('status'), 'status');
  assert.equal(intentOf('holders 33jENUQnjoitkMFpvNJcSHyLAHFWJuHwT6E3E8CNpump'), 'holders');
  assert.equal(intentOf('33jENUQnjoitkMFpvNJcSHyLAHFWJuHwT6E3E8CNpump'), null);   // a bare mint still goes to the lookup card
});
await t('reignite rank: accelerating, bid, off-peak graduate outranks a boosted vertical one; holders add when known', () => {
  const good = reigniteRank({ volAccel: 3, txAccel: 2.5, buyRatio1h: 0.64, buyRatio5: 0.6, higherLow: true, breakout: true, fromPeak: 0.6, liqUsd: 60000, mcapUsd: 400000, liqTrend: 1.1, c1h: 30, fdvLiq: 7 });
  const bad = reigniteRank({ volAccel: 1.3, txAccel: 1, buyRatio1h: 0.5, fromPeak: 0.98, liqUsd: 10000, mcapUsd: 600000, c1h: 180, fdvLiq: 60 }, { boosts: 20 });
  assert.ok(good.score > bad.score + 30, `${good.score} vs ${bad.score}`);
  assert.ok(good.reasons.some((r) => /higher low/.test(r)) && bad.flags.some((f) => /paid boost/.test(f)));
  const withH = reigniteRank({ volAccel: 3, txAccel: 2.5, buyRatio1h: 0.64, fromPeak: 0.6, liqUsd: 60000, mcapUsd: 400000 }, { holders: 3000, growth: { deltaPct: 12, minutes: 60 } });
  assert.ok(withH.score > good.score - 20 && withH.reasons.some((r) => /3,000 holders \(\+12% in 60 min\)/.test(r)));
  assert.equal(reigniteRank({ volAccel: 1 }).parts.holders, undefined);   // unknown is unknown, not zero
});
await t('soon rank: progress and live flow dominate; concentration and dumping penalise', () => {
  const a = soonRank({ progressPct: 88, flow60Sol: 2.5, netSolPerMin: 1.5, uniqueBuyers: 160, buyers60: 9, secSinceTrade: 20, top10Pct: 18, drawdownPct: 5, holders: 140 }, { score: 72 });
  const b = soonRank({ progressPct: 45, flow60Sol: -1, netSolPerMin: 0.1, uniqueBuyers: 30, buyers60: 1, secSinceTrade: 400, top10Pct: 48, drawdownPct: 40, creatorSold: true }, { score: 30 });
  assert.ok(a.score > 70 && b.score < 20, `${a.score} / ${b.score}`);
  assert.ok(b.flags.length >= 3 && a.reasons[0] === '88% of the curve');
});
await t('Picks never serves rejected coins and logs what it served', () => {
  const mk = (sym, f, reject = null) => ({ mint: `${sym}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.slice(0, 44), symbol: sym, graduated: false, lite: false, mcap: 60, lastScore: { score: 60, reject }, rejectedHard: null, features: () => f });
  const f = { progressPct: 80, flow60Sol: 2, netSolPerMin: 1, uniqueBuyers: 120, buyers60: 5, secSinceTrade: 10, top10Pct: 20, drawdownPct: 3, holders: 90, ageSec: 900 };
  const engine = { tokens: new Map([['a', mk('AAA', f)], ['b', mk('BBB', f, 'bundled launch')]]) };
  const p = new Picks({ engine, grads: { watch: new Map(), solUsd: 200 } });
  const s = p.soon(5, { source: 'test' });
  assert.equal(s.rows.length, 1); assert.equal(s.rows[0].symbol, 'AAA'); assert.equal(s.rows[0].mcapUsd, 12000);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM pick_log WHERE kind = 'soon' AND source = 'test'").get().n, 1);
  const r = p.reigniting(5, { source: 'test' }); assert.equal(r.rows.length, 0); assert.equal(r.holdersTracked, false);
});
await t('scale-out book: 80% at +125%, remainder behind a breakeven floor; Main entries', () => {
  const S = STRATEGIES.scale; assert.equal(S.tpMult, 2.25); assert.equal(S.tpFraction, 0.8); assert.equal(S.beAfterTp, true); assert.equal(S.candidate, true);
});
await t('holders module is inert without a key: null, never zero', async () => {
  assert.equal(holdersEnabled(), false); assert.equal(await countHolders('x'), null); assert.equal(holdersOf('x'), null);
});
console.log(`${n} picks tests passed`);
