// Paper-engine tests: entries, exits (target, stop with exit delay, idle), confirm skips, gap flags,
// the kill rule (PASS / MARGINAL / FAIL and the random-control requirement) and restart restore.
// Runs against a throwaway database with a fake clock. Usage: npm test
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir = mkdtempSync(path.join(tmpdir(), 'cw-test-'));
process.env.DATA_DIR = dir;
process.env.LOG_LEVEL = 'error';
let NOW = 1_800_000_000_000;
const realNow = Date.now;
Date.now = () => NOW;
const adv = (sec) => { NOW += sec * 1000; };

const { config } = await import('../src/config.js');
const { db } = await import('../src/db.js');
const paper = await import('../src/engine/paper.js');
const P = config.paper;

let mintN = 0;
class Tok {
  constructor(sym) { this.mint = `TEST${++mintN}`.padEnd(44, 'x'); this.symbol = sym; this.vsol = 30; this.vtok = 1.073e9 * 0.98; this.lastTradeAt = NOW; this.graduated = false; this.lastFeatures = {}; this.createdAt = NOW - 120000; }
  get mcap() { return (this.vsol / this.vtok) * 1e9; }
  /** move price to `m` × current along the constant-product curve */
  move(m) { const k = this.vsol * this.vtok; this.vsol *= Math.sqrt(m); this.vtok = k / this.vsol; this.lastTradeAt = NOW; }
}
const toks = new Map();
const getToken = (m) => toks.get(m);
const mk = (s) => { const t = new Tok(s); toks.set(t.mint, t); return t; };
const row = (mint, book = 'main') => db.prepare(`SELECT * FROM paper_trades WHERE mint = ? AND book = ? ORDER BY id DESC LIMIT 1`).get(mint, book);
const openUp = (t, book = 'main') => { paper.scheduleEntry(t, null, { book, score: 80 }); adv(paper.STRATEGIES[book].delaySec + 0.1); paper.tick(getToken); return row(t.mint, book); };

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('entry fills after the configured delay at the live curve price', () => {
  const t = mk('ENTRY');
  paper.scheduleEntry(t, null, { book: 'main', score: 80 });
  paper.tick(getToken);
  assert.equal(row(t.mint), undefined, 'must not fill before the delay');
  t.move(1.05);
  adv(P.entryDelaySec + 0.1); paper.tick(getToken);
  const r = row(t.mint);
  assert.equal(r.status, 'open');
  assert.ok(Math.abs(r.entry_slip_pct - 5) < 0.6, `slip should be ~5%, got ${r.entry_slip_pct}`);
  t.graduated = true; paper.onTrade(t.mint); // clean up
});

test('take profit triggers on a trade and fills after the exit delay', () => {
  const t = mk('TP');
  openUp(t);
  const S = paper.STRATEGIES.main;
  t.move(S.tpMult * 1.25); paper.onTrade(t.mint);
  let r = row(t.mint);
  assert.ok(r.trigger_pct > 0, 'trigger recorded');
  assert.equal(r.status, 'open', 'fill waits for the exit delay');
  adv(P.exitDelaySec + 0.1); paper.onTrade(t.mint);
  r = row(t.mint);
  const ev = JSON.parse(r.events);
  assert.ok(ev.some((e) => e.type === 'tp1'), 'tp1 event written');
  if (r.status === 'open') { t.graduated = true; paper.onTrade(t.mint); r = row(t.mint); }
  assert.equal(r.status, 'closed'); assert.ok(r.pnl_pct > 0, `profit expected, got ${r.pnl_pct}`);
});

test('stop: price keeps falling during the exit delay, so the fill is worse than the trigger', () => {
  const t = mk('STOP');
  openUp(t);
  t.move(0.55); paper.onTrade(t.mint);
  let r = row(t.mint);
  assert.equal(r.status, 'open'); assert.ok(r.trigger_pct <= -P.stopPct, `trigger at/below stop, got ${r.trigger_pct}`);
  t.move(0.8); adv(P.exitDelaySec + 0.1); paper.onTrade(t.mint);
  r = row(t.mint);
  assert.equal(r.status, 'closed'); assert.match(r.exit_reason, /^stop/);
  assert.ok(r.pnl_pct < r.trigger_pct - 5, `fill (${r.pnl_pct}) should be well below trigger (${r.trigger_pct})`);
});

test('idle curve exits after the idle window', () => {
  const t = mk('IDLE');
  openUp(t);
  adv(P.idleExitMin * 60 + 1); paper.tick(getToken);
  adv(P.exitDelaySec + 0.1); paper.tick(getToken);
  const r = row(t.mint);
  assert.equal(r.status, 'closed'); assert.match(r.exit_reason, /idle|max hold/);
});

test('confirm book skips when price is below the signal after its wait', () => {
  const S = paper.STRATEGIES.confirm; if (!S || S.requireMinRet == null) return 'skipped: confirm book disabled';
  const t = mk('CONF');
  paper.scheduleEntry(t, null, { book: 'confirm', score: 80 });
  t.move(0.9); adv(S.delaySec + 0.1); paper.tick(getToken);
  const r = row(t.mint, 'confirm');
  assert.equal(r.status, 'skipped'); assert.match(r.skip_reason, /vs signal/);
});

test('a data gap flags open trades and excludes them from stats', () => {
  const t = mk('GAP');
  const r0 = openUp(t);
  assert.ok(paper.markGap() >= 1);
  t.graduated = true; paper.onTrade(t.mint);
  const r = row(t.mint);
  assert.equal(r.status, 'closed'); assert.equal(r.gap, 1);
  assert.ok(!paper.closedCurrent().some((x) => x.id === r0.id), 'gap trade excluded from closedCurrent');
});

test('kill rule: PASS / MARGINAL / FAIL and the random-control requirement', () => {
  const rows = (vals) => vals.map((v, i) => ({ pnl_pct: v, pnl_sol: v / 100 * 0.1, exit_ts: i }));
  const good = rows(Array.from({ length: 80 }, (_, i) => (i % 3 === 0 ? -15 : 22)));
  const ctrl = rows(Array.from({ length: 60 }, (_, i) => (i % 2 ? -20 : 10)));
  const k1 = paper.killStatsFrom(good, { control: ctrl });
  assert.equal(k1.status, 'PASS', JSON.stringify(k1.checks));
  assert.ok(k1.ci99LowPct > 0 && k1.checks.halves && k1.checks.control);
  // positive but beats-control not shown -> MARGINAL
  const k2 = paper.killStatsFrom(good, { control: good });
  assert.equal(k2.status, 'MARGINAL');
  // too noisy for 99% -> MARGINAL
  const noisy = rows(Array.from({ length: 60 }, (_, i) => (i % 2 ? -40 : 44)));
  assert.equal(paper.killStatsFrom(noisy).status, 'MARGINAL');
  // first half good, second half bad -> not PASS
  const decay = rows([...Array(40).fill(30), ...Array(40).fill(-2)]);
  assert.notEqual(paper.killStatsFrom(decay).status, 'PASS');
  assert.equal(paper.killStatsFrom(rows(Array(60).fill(-5))).status, 'FAIL');
  assert.equal(paper.killStatsFrom(rows(Array(10).fill(5))).status, 'COLLECTING');
});

test('restart restore: a position on a token no longer in memory is rebuilt from the tape and keeps marking', () => {
  const t = mk('GHOST');
  const r0 = openUp(t);
  db.prepare(`INSERT INTO trades (mint,ts,slot,sig,wallet,is_buy,sol,tok,vsol,vtok) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(t.mint, NOW, 1, 's', 'w', 1, 0.1, 1, t.vsol, t.vtok);
  // simulate a restart: forget the token, restore with a short downtime
  toks.delete(t.mint);
  paper.restoreOpen(getToken, { downSec: 5 });
  const r1 = row(t.mint);
  assert.equal(r1.status, 'open'); assert.equal(r1.restored, 1); assert.ok(!r1.gap, 'short downtime: not flagged');
  // live trade arrives for the ghost: drop through the stop
  const k = t.vsol * t.vtok, vsol = t.vsol * Math.sqrt(0.5);
  assert.equal(paper.ghostTrade({ mint: t.mint, vsol, vtok: k / vsol, isBuy: false, sol: 0.1, tok: 1, slot: 2, sig: 's2', wallet: 'w2' }), true);
  adv(P.exitDelaySec + 0.1); paper.ghostTrade({ mint: t.mint, vsol, vtok: k / vsol, isBuy: false, sol: 0.1, tok: 1, slot: 3, sig: 's3', wallet: 'w3' });
  const r2 = row(t.mint);
  assert.equal(r2.id, r0.id); assert.equal(r2.status, 'closed'); assert.match(r2.exit_reason, /^stop/);
});

test('restart restore: long or unknown downtime flags the position', () => {
  const t = mk('LONGDOWN');
  openUp(t);
  db.prepare(`INSERT INTO trades (mint,ts,slot,sig,wallet,is_buy,sol,tok,vsol,vtok) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(t.mint, NOW, 1, 's', 'w', 1, 0.1, 1, t.vsol, t.vtok);
  toks.delete(t.mint);
  paper.restoreOpen(getToken, { downSec: config.health.restoreMaxDownSec + 60 });
  assert.equal(row(t.mint).gap, 1);
});

let fail = 0;
for (const [name, fn] of tests) {
  try { const r = fn(); console.log(`  ok   ${name}${typeof r === 'string' ? ` (${r})` : ''}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
Date.now = realNow;
try { db.close(); } catch { /* ignore */ }
rmSync(dir, { recursive: true, force: true });
console.log(fail ? `\n${fail} of ${tests.length} failed` : `\nall ${tests.length} passed`);
process.exit(fail ? 1 : 0);
