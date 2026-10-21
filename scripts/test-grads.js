// Unit tests for the graduates tracker: two exit books and the alive-past-72h rule (in-memory DB, no network).
import assert from 'node:assert/strict';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cwgr-'));
process.env.GRAD_TRAIL_ENABLED = 'true'; process.env.GRAD_TRAIL_ARM_MULT = '1.2'; process.env.GRAD_TRAIL_BOOK_PCT = '30'; process.env.GRAD_PAPER_STOP_PCT = '38.5';
process.env.GRAD_MAX_AGE_H = '72'; process.env.GRAD_EXT_MAX_AGE_H = '336'; process.env.GRAD_MIN_LIQ_USD = '12000'; process.env.GRAD_ALIVE_VOL24_USD = '25000';
const { Graduates } = await import('../src/engine/graduates.js');
const dbmod = await import('../src/db.js');
const { config } = await import('../src/config.js');
const { initRejects } = await import('../src/engine/rejects.js');
initRejects();
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const g = new Graduates(); g.solUsd = 100;
const GP = config.gradPaper;
const pos = (book, o = {}) => ({ book, sizeSol: 0.2, peak: 0.2, realized: 0, unitsLeft: 1, tp1Done: false, ...o });

t('fixed book: TP1 at 1.5x, stop at -38.5%, max hold at 360 min', () => {
  assert.equal(g.exitRule(pos('fixed'), 1.5, 0.3, 10), 'tp1');
  assert.equal(g.exitRule(pos('fixed'), 0.615, 0.123, 10), 'stop -38.5%');
  assert.equal(g.exitRule(pos('fixed'), 1.1, 0.22, 10), null);
  assert.equal(g.exitRule(pos('fixed'), 1.1, 0.22, 360), 'max hold');
  assert.equal(g.exitRule(pos('fixed', { tp1Done: true, peak: 0.4 }), 1.4, 0.28, 10), 'trailing stop 25%');
});
t('trail book: no TP1, no 6 h clock, hard stop while unarmed', () => {
  assert.equal(g.exitRule(pos('trail'), 1.5, 0.3, 10), null, 'does not take partial profit');
  assert.equal(g.exitRule(pos('trail'), 1.1, 0.22, 360), null, 'no max hold at 6 h');
  assert.equal(g.exitRule(pos('trail'), 1.1, 0.22, GP.trailMaxHoldMin), `max hold ${GP.trailMaxHoldMin / 60} h`);
  assert.equal(g.exitRule(pos('trail'), 0.6, 0.12, 10), 'stop -38.5%');
  assert.equal(g.exitRule(pos('trail', { peak: 0.23 }), 0.6, 0.12, 10), 'stop -38.5%', 'peak 1.15x is below the 1.2x arm, so the hard stop still applies');
});
t('47% loss ceiling applies even after a trailing book is armed', () => {
  assert.match(g.exitRule(pos('trail', {peak:0.5}),0.5,0.1,10), /loss ceiling -47%/);
  assert.match(g.exitRule(pos('fixed'),0.5,0.1,10), /loss ceiling -47%/);
});
t('trail book: once armed at 1.2x, exits 30% below the running peak and never on the hard stop', () => {
  const p = pos('trail', { peak: 0.5 }); // peaked at 2.5x
  assert.equal(g.exitRule(p, 1.8, 0.36, 10), null, '0.36 > 0.35 (70% of peak): still in');
  assert.match(g.exitRule(p, 1.74, 0.348, 10), /^trailing stop 30% \(from 2\.5×\)/);
  const p2 = pos('trail', { peak: 0.24 }); // armed exactly at 1.2x
  assert.match(g.exitRule(p2, 0.8, 0.16, 10), /^trailing stop 30%/, 'armed, so the exit is the trail (at 0.168), not the -38.5% stop');
});
t('alive past the base window: price holding vs migration with a pool and volume, or an open position', () => {
  const st = { mint: 'M', migPrice: 1, peakPrice: 3 };
  assert.equal(g.alive(st, { price: 1.05, liq: 20000, v24: 30000 }), true);
  assert.equal(g.alive(st, { price: 0.95, liq: 20000, v24: 30000 }), false, 'below migration price');
  assert.equal(g.alive(st, { price: 1.5, liq: 9000, v24: 30000 }), false, 'pool under the minimum');
  assert.equal(g.alive(st, { price: 1.5, liq: 20000, v24: 10000 }), false, 'volume too thin');
  assert.equal(g.alive({ mint: 'N', migPrice: null, peakPrice: 2 }, { price: 1.1, liq: 20000, v24: 30000 }), true, 'no migration price: half of peak is enough');
  assert.equal(g.alive({ mint: 'N', migPrice: null, peakPrice: 2 }, { price: 0.9, liq: 20000, v24: 30000 }), false);
  g.open.set('trail:D', pos('trail', { mint: 'D' }));
  assert.equal(g.alive({ mint: 'D', migPrice: 1 }, { price: 0.1, liq: 100, v24: 0 }), true, 'open paper position keeps it watched');
  g.open.clear();
});
t('hasOpen matches by mint across books only', () => {
  g.open.set('fixed:ABC', pos('fixed', { mint: 'ABC' }));
  assert.equal(g.hasOpen('ABC'), true); assert.equal(g.hasOpen('BC'), false); assert.equal(g.hasOpen('ABCD'), false);
  g.open.clear();
});
t('bookView lists both books with their rules', () => {
  const v = g.bookView();
  assert.deepEqual(Object.keys(v.books), ['fixed', 'trail']);
  assert.match(v.books.trail.rule, /trailing stop from the peak/); assert.equal(v.books.fixed.kill.status, 'COLLECTING'); assert.equal(v.paired, null);
});
t('restart: series rebuilt from stored snapshots so the 6 h labeler does not censor live tokens', () => {
  const { db } = dbmod; const now = Date.now(), mint = 'RESTOREMINT111';
  db.prepare(`INSERT INTO grad_watch (mint,symbol,name,source,added_at,active) VALUES (?,?,?,?,?,1)`).run(mint, 'RST', 'Restore', 'migration', now - 7 * 3600000);
  const ins = db.prepare(`INSERT INTO grad_snapshots (mint,ts,price,mcap,liq) VALUES (?,?,?,?,?)`);
  for (let i = 0; i < 40; i++) ins.run(mint, now - 6.5 * 3600000 + i * 600000, 1 + i * 0.01, 1000 + i, 500);
  const g2 = new Graduates(); g2.solUsd = 100; g2.restore();
  const st = g2.watch.get(mint); assert.ok(st, 'watch restored');
  assert.ok(st.series.length >= 35 && st.series.length <= 37, `last 6 h of points restored (${st.series.length})`);
  assert.equal(st.last, null, 'last reading stays unknown until the next real poll');
  assert.ok(st.series.every((p) => p.restored && p.price > 0 && p.t >= now - 6 * 3600000));
});
console.log(`${n} graduates tests passed`);
