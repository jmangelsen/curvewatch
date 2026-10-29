// Winner tracks: runnerA, holderB, signals, survival labels, and the read-only CSV join.
// Main's hard rejects and the Main/capital mirror stay as they are.
import Database from 'better-sqlite3';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-winners-'));
process.env.DATA_DIR = dir;
process.env.LOG_LEVEL = 'error';
process.env.FETCH_METADATA = 'false';
process.env.HELIUS_API_KEY = '';
process.env.TELEGRAM_BOT_TOKEN = '';
let NOW = 1_800_000_000_000;
const realNow = Date.now;
Date.now = () => NOW;
const adv = (sec) => { NOW += sec * 1000; };

const { config } = await import('../src/config.js');
const { db } = await import('../src/db.js');
const { score } = await import('../src/engine/score.js');
const paper = await import('../src/engine/paper.js');
const { market } = await import('../src/market.js');
const { CFG } = await import('../src/version.js');
const wt = await import('../src/engine/winnerTracks.js');
const { Graduates } = await import('../src/engine/graduates.js');
const { Engine } = await import('../src/engine/engine.js');
const { Token } = await import('../src/engine/token.js');

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok', name); };
const P = config.paper;
const R = config.strategies.runnerA;
const H = config.strategies.holderB;

function curveTok(sym) {
  return {
    mint: sym.padEnd(44, 'z'), symbol: sym, vsol: 40, vtok: 8e8, mcap: 50, lastTradeAt: NOW, graduated: false,
    progress: 0.4, trades: [], createdAt: NOW - 200_000, creator: 'DEV', lastFeatures: {}, lastScore: { reject: null, score: 80, raw: 80 },
  };
}
const get = (t) => () => t;

function tape(now, { buyersPrior = 2, buyersRecent = 5, mcap = 30, extra = [] } = {}) {
  const trades = [...extra];
  for (let i = 0; i < buyersPrior; i++) trades.push({ at: now - 90_000, b: true, w: `p${i}`, sol: 0.2, tok: 10, mcap, slot: 50 });
  for (let i = 0; i < buyersRecent; i++) trades.push({ at: now - 20_000, b: true, w: `r${i}`, sol: 0.2, tok: 10, mcap, slot: 50 });
  return trades.sort((a, b) => a.at - b.at);
}
function runnerTok(now, over = {}) {
  const createdAt = over.createdAt ?? now - 200_000;
  const trades = over.trades || tape(now);
  return { mint: 'M', createdAt, createSlot: 10, creator: 'DEV', mcap: 30, progress: 0.4, trades, ...over, createdAt, trades };
}
const feat = (over = {}) => ({ progressPct: 40, mcapSol: 30, creatorSoldPct: 0, creatorSold: false, bundlePct: 0, ...over });
const call = (token, now, over = {}) => wt.considerRunnerA(token, { now, raw: 80, reject: null, features: feat(), solUsd: 100, ...over });

function rich(over = {}) {
  return {
    quoteOk: true, mayhem: false, creatorLaunches: 1, creatorGraduations: 0, creatorSoldPct: 0, creatorSold: false,
    bundlePct: 0, bundleWallets: 0, top10Pct: 10, drawdownPct: 0, progressPct: 40, repeatTradeShare: 0,
    netSolPerMin: 10, flow60Sol: 8, buyersPerMin: 40, buySellRatio: 3, hasTelegram: true, hasTwitter: true, hasWebsite: true,
    smartBuyers: 0, initialBuySol: 1, secSinceTrade: 5, uniqueBuyers: 40, tinyBuyShare: 0, ...over,
  };
}
function floorSeries(now, price = 1) {
  const pts = [];
  for (let i = 16; i >= 0; i--) pts.push({ t: now - i * 60_000, price });
  return pts;
}

test('provisional thresholds are the registered priors', () => {
  assert.equal(R.provisional, true);
  assert.equal(R.minCurvePct, 25);
  assert.equal(R.maxCurvePct, 60);
  assert.equal(R.maxMcapUsd, 40000);
  assert.equal(R.minScore, 72);
  assert.equal(R.sustainSec, 20);
  assert.equal(R.maxPremiumPct, 12);
  assert.equal(R.priceWindowSec, 180);
  assert.equal(R.minPrints, 3);
  assert.equal(R.exitMcapUsd, 100000);
  assert.equal(R.exitCurvePct, 95);
  assert.equal(R.trailPct, 20);
  assert.equal(R.maxHoldMin, 20);
  assert.equal(R.bundleWindowSec, 60);
  assert.equal(R.bundleSellMaxNetSol, 0);
  assert.equal(H.provisional, true);
  assert.equal(H.minAgeMin, 30);
  assert.equal(H.floorMin, 15);
  assert.equal(H.floorFrac, 0.9);
  assert.equal(H.maxBundlePct, 25);
  assert.equal(H.minCreatorHoldPct, 0.01);
  assert.equal(H.top10FlatPp, 0.5);
  assert.equal(H.stopPct, 38.5);
  assert.equal(H.tp1Multiple, 2);
  assert.equal(H.tp1Fraction, 0.5);
  assert.equal(H.maxHoldMin, 1440);
  assert.equal(H.survivalFloorFrac, 0.5);
  assert.deepEqual(H.survivalHorizonsH, [24, 72]);
  assert.equal(H.earlyMaxBagPct, 5);
  assert.equal(H.earlyTop5Pct, 15);
  assert.equal(R.snipeWallets, 19);
  assert.equal(R.snipeWindowSec, 10);
  assert.equal(R.snipeSupplyPct, 79);
  assert.equal(R.snipeSizeFrac, 0.25);
  assert.equal(R.snipeFastBondSec, 15);
  assert.equal(config.scoring.alertScore, 72);
  assert.equal(config.scoring.maxCreatorSoldPct, 50);
  assert.equal(config.scoring.maxBundlePct, 55);
  assert.equal(config.scoring.maxCurveProgressPct, 88);
});

test('Main hard rejects are unchanged', () => {
  assert.ok(score(rich()).score >= 72);
  assert.match(score(rich({ creatorSoldPct: 60, creatorSold: true })).reject, /creator sold/);
  assert.match(score(rich({ bundlePct: 60, bundleWallets: 4 })).reject, /bundled launch/);
  assert.match(score(rich({ progressPct: 90 })).reject, /late: curve/);
  assert.equal(paper.STRATEGIES.main.entry, `score ≥ ${config.scoring.alertScore}`);
  assert.equal(paper.STRATEGIES.main.winnerExits, undefined);
  assert.equal(paper.STRATEGIES.main.allowHardReject, undefined);
  assert.equal(paper.STRATEGIES.main.maxHoldMin, P.maxHoldMin);
});

test('a Main entry still mirrors capital and does not open runnerA', () => {
  const t = curveTok('MAIN');
  market.solUsd = 100;
  paper.scheduleEntry(t, 1, { book: 'main', score: 80, features: feat() });
  adv(P.entryDelaySec + 0.2);
  paper.tick(get(t));
  const books = db.prepare(`SELECT book FROM paper_trades WHERE mint=?`).all(t.mint).map((r) => r.book).sort();
  assert.deepEqual(books, ['capital', 'main']);
  t.graduated = true;
  paper.onTrade(t.mint);
});

test('runnerA fills a hard-rejected token; Main and capital skip it; graduation closes it', () => {
  const t = curveTok('REJ');
  t.rejectedHard = { reason: 'creator sold 60%' };
  t.lastScore = { reject: 'creator sold 60%', score: 0, raw: 80 };
  paper.scheduleEntry(t, 2, { book: 'main', score: 80, features: feat() });
  paper.scheduleEntry(t, 2, { book: 'runnerA', score: 80, features: { ...feat(), runnerFlags: ['dev-sold'] } });
  adv(P.entryDelaySec + 0.2);
  paper.tick(get(t));
  const rows = db.prepare(`SELECT book, status FROM paper_trades WHERE mint=?`).all(t.mint);
  const map = Object.fromEntries(rows.map((r) => [r.book, r.status]));
  assert.equal(map.main, 'skipped');
  assert.equal(map.capital, 'skipped');
  assert.equal(map.runnerA, 'open');
  const flags = JSON.parse(db.prepare(`SELECT features FROM paper_trades WHERE mint=? AND book='runnerA'`).get(t.mint).features);
  assert.ok(flags.runnerFlags.includes('dev-sold'));
  t.graduated = true;
  paper.onTrade(t.mint);
  const closed = db.prepare(`SELECT status, exit_reason FROM paper_trades WHERE mint=? AND book='runnerA'`).get(t.mint);
  assert.equal(closed.status, 'closed');
  assert.match(closed.exit_reason, /graduated/);
});

test('runnerA exits on curve 95% and does not use the idle clock', () => {
  const t = curveTok('CURVE');
  market.solUsd = 100;
  paper.scheduleEntry(t, null, { book: 'runnerA', score: 80, features: feat() });
  adv(P.entryDelaySec + 0.2);
  paper.tick(get(t));
  assert.equal(db.prepare(`SELECT status FROM paper_trades WHERE mint=? AND book='runnerA'`).get(t.mint).status, 'open');
  adv(P.idleExitMin * 60 + 5);
  paper.tick(get(t));
  adv(P.exitDelaySec + 0.2);
  paper.tick(get(t));
  assert.equal(db.prepare(`SELECT status FROM paper_trades WHERE mint=? AND book='runnerA'`).get(t.mint).status, 'open', 'idle clock is Main, not runnerA');
  t.progress = 0.96;
  paper.onTrade(t.mint);
  adv(P.exitDelaySec + 0.2);
  paper.onTrade(t.mint);
  const row = db.prepare(`SELECT status, exit_reason FROM paper_trades WHERE mint=? AND book='runnerA'`).get(t.mint);
  assert.equal(row.status, 'closed');
  assert.match(row.exit_reason, /curve 95%/);
});

test('runnerA time limit is 20 minutes', () => {
  const t = curveTok('HOLD');
  market.solUsd = 100;
  paper.scheduleEntry(t, null, { book: 'runnerA', score: 90, features: feat() });
  adv(P.entryDelaySec + 0.2);
  paper.tick(get(t));
  assert.equal(db.prepare(`SELECT status FROM paper_trades WHERE mint=? AND book='runnerA'`).get(t.mint).status, 'open');
  adv(R.maxHoldMin * 60 + 1);
  paper.tick(get(t));
  adv(P.exitDelaySec + 0.2);
  paper.tick(get(t));
  const row = db.prepare(`SELECT status, exit_reason FROM paper_trades WHERE mint=? AND book='runnerA'`).get(t.mint);
  assert.equal(row.status, 'closed');
  assert.match(row.exit_reason, /max hold 20m/);
});

test('runnerA does not enter on the first crossing; a dip resets the clock', () => {
  const t = runnerTok(NOW);
  const first = call(t, NOW);
  assert.equal(first.enter, false);
  assert.equal(first.gates.sustain, false);
  assert.equal(t.runnerScoreSince, NOW);
  const dipped = call(t, NOW + 10_000, { raw: 10 });
  assert.equal(dipped.enter, false);
  assert.equal(t.runnerScoreSince, null);
  const again = call(t, NOW + 10_001, { raw: 90 });
  assert.equal(again.enter, false, 'a fresh cross is not an entry');
  const held = call(t, NOW + 10_001 + R.sustainSec * 1000);
  assert.equal(held.enter, true);
  assert.equal(t.runnerAAt != null, true);
  assert.equal(call(t, NOW + 99_000).acted, false);
});

test('runnerA gates: curve, mcap, buyers, bundle sellers, premium, and other hard rejects', () => {
  const now = NOW;
  const miss = (label, token, over) => {
    const d = call(token, now, over);
    assert.equal(d.enter, false, label);
  };
  miss('curve', runnerTok(now), { features: feat({ progressPct: 10 }) });
  miss('late curve', runnerTok(now), { features: feat({ progressPct: 70 }) });
  miss('mcap', runnerTok(now), { solUsd: 2000 });
  miss('no sol price', runnerTok(now), { solUsd: null });
  const flat = runnerTok(now, { trades: tape(now, { buyersPrior: 4, buyersRecent: 4 }) });
  miss('buyers', flat, {});
  const bundled = runnerTok(now, { trades: [
    { at: now - 190_000, b: true, w: 'B1', sol: 1, tok: 10, mcap: 30, slot: 10 },
    { at: now - 189_000, b: true, w: 'B2', sol: 1, tok: 10, mcap: 30, slot: 11 },
    { at: now - 90_000, b: false, w: 'B1', sol: 3, tok: 10, mcap: 30, slot: 40 },
    ...tape(now),
  ] });
  miss('bundle sellers', bundled, {});
  const richPx = runnerTok(now);
  richPx.mcap = 50;
  miss('premium', richPx, {});
  const blocked = runnerTok(now);
  const no = call(blocked, now, { reject: 'top-10 hold 50%', raw: 90 });
  assert.equal(no.enter, false);
  assert.equal(no.gates.score, false);
  const allowed = runnerTok(now);
  const flagged = call(allowed, now, { reject: 'bundled launch (60% of buys in first slots)', raw: 80, features: feat({ bundlePct: 60 }) });
  assert.ok(flagged.flags.includes('bundled'));
  assert.equal(flagged.enter, false);
  const dev = runnerTok(now);
  const devCall = call(dev, now, { reject: 'creator sold 80%', raw: 80, features: feat({ creatorSoldPct: 80, creatorSold: true }) });
  assert.ok(devCall.flags.includes('dev-sold'));
  const ready = runnerTok(now);
  call(ready, now);
  assert.equal(call(ready, now + R.sustainSec * 1000, { reject: 'creator sold 80%', raw: 80, features: feat({ creatorSoldPct: 80, creatorSold: true }) }).enter, true);
});

test('snipe concentration caps runnerA size and is the earliest exit; spread-out early bags are a holderB flag', () => {
  const born = NOW - 200_000;
  const trades = [{ at: born + 500, b: true, w: 'BIG', sol: 1, tok: 790_000_000, mcap: 30, slot: 40 }];
  for (let i = 0; i < 18; i++) trades.push({ at: born + 600 + i, b: true, w: `S${i}`, sol: 0.01, tok: 1, mcap: 30, slot: 40 });
  const sniped = wt.earlyHolderTape({ createdAt: born, trades }, NOW);
  assert.ok(sniped.snipeSupplyPct >= 79, String(sniped.snipeSupplyPct));
  assert.equal(wt.runnerAExit({ snipeSupplyPct: sniped.snipeSupplyPct, progressPct: 40, mcapUsd: 1000, bundleRecentNetSol: null, multiple: 0.95, peakMultiple: 1, heldMin: 1 }).reason, 'snipe concentration');
  const supply = 1e9;
  const spreadTrades = [0, 1, 2, 3, 4].map((i) => ({ at: born + i, b: true, w: `E${i}`, sol: 0.1, tok: supply * (i === 0 ? 0.04 : 0.02), mcap: 30 }));
  const spread = wt.earlyHolderTape({ createdAt: born, trades: spreadTrades }, NOW);
  assert.equal(spread.spreadOut, true);
  assert.ok(spread.earlyMaxBagPct < 5 && spread.earlyTop5Pct < 15);
  const tight = wt.earlyHolderTape({ createdAt: born, trades: [{ at: born + 1, b: true, w: 'ONE', sol: 1, tok: supply * 0.06, mcap: 30 }] }, NOW);
  assert.equal(tight.spreadOut, false);
  const t = curveTok('SNIPE');
  t.createdAt = born;
  t.trades = trades;
  paper.scheduleEntry(t, null, { book: 'runnerA', score: 80, features: { snipeSupplyPct: sniped.snipeSupplyPct, sizeFrac: R.snipeSizeFrac, loggedFlags: ['unique-traders'] }, sizeSol: P.sizeSol * R.snipeSizeFrac });
  adv(P.entryDelaySec + 0.2);
  paper.tick(get(t));
  adv(P.exitDelaySec + 0.2);
  paper.tick(get(t));
  const row = db.prepare(`SELECT status, exit_reason, size_sol FROM paper_trades WHERE mint=? AND book='runnerA'`).get(t.mint);
  assert.equal(row.status, 'closed');
  assert.match(row.exit_reason, /snipe concentration/);
  assert.ok(Math.abs(row.size_sol - P.sizeSol * R.snipeSizeFrac) < 1e-9);
});

test('holderB rejects a fast-bonding snipe and does not score boosts or unique traders', () => {
  const now = NOW;
  const points = { holderPoints: [{ ts: 1, value: 10 }, { ts: 2, value: 14 }], top10Points: [{ ts: 1, value: 22 }, { ts: 2, value: 21 }] };
  const base = {
    pairCreatedAt: now - 31 * 60_000, series: floorSeries(now), curveBundlePct: 10, curveCreatorHoldPct: 2, ramp: false,
    curveFlags: { snipeSupplyPct: 80, createdAt: now - 31 * 60_000 - 10_000, earlyMaxBagPct: 4, earlyTop5Pct: 12, uniqueBuyers: 400 },
  };
  const hot = wt.considerHolderB(base, { now, ...points, boosts: 3 });
  assert.equal(hot.snipeReject, true);
  assert.equal(hot.enter, false);
  assert.equal(hot.control, true);
  assert.ok(hot.features.loggedFlags.includes('paid-boost'));
  assert.ok(hot.features.loggedFlags.includes('unique-traders'));
  assert.equal(hot.features.spreadOut, true);
  const slow = { ...base, curveFlags: { ...base.curveFlags, createdAt: now - 31 * 60_000 - 120_000 } };
  const quiet = wt.considerHolderB(slow, { now, ...points, boosts: 0 });
  const loud = wt.considerHolderB(slow, { now, ...points, boosts: 9, uniqueBuyers: 900 });
  assert.equal(quiet.snipeReject, false);
  assert.equal(quiet.enter, true);
  assert.equal(loud.enter, quiet.enter);
  assert.equal(loud.features.paidBoosts, 9);
  const g = new Graduates();
  const last = { t: now, price: 1, liq: 20_000, mcap: 50_000, fdv: 60_000, v5: 1000, v1h: 5000, v6h: 0, v24: 0, b5: 10, s5: 5, b1h: 40, s1h: 20, c5: 1, c1h: 2, c6h: 0, c24: 1 };
  const plain = { last, series: [], migPrice: 1, peakPrice: 1.1, info: { boosts: 0, socials: [], websites: [] } };
  const paid = { last: { ...last }, series: [], migPrice: 1, peakPrice: 1.1, info: { boosts: 5, socials: [], websites: [] } };
  g.score(plain, 40);
  g.score(paid, 40);
  assert.equal(plain.score, paid.score);
  assert.ok(paid.flags.some((f) => /boost/.test(f)));
});

test('runnerA exit rule: mcap, bundle selling, trail, and the 20 minute clock', () => {
  const base = { progressPct: 40, mcapUsd: 1000, bundleRecentNetSol: null, multiple: 0.95, peakMultiple: 1, heldMin: 1 };
  assert.match(wt.runnerAExit({ ...base, progressPct: 95 }).reason, /curve 95%/);
  assert.match(wt.runnerAExit({ ...base, mcapUsd: 100000 }).reason, /mcap \$100k/);
  assert.match(wt.runnerAExit({ ...base, bundleRecentNetSol: -0.01 }).reason, /bundle wallets net selling/);
  assert.match(wt.runnerAExit({ ...base, multiple: 0.7, peakMultiple: 1 }).reason, /trailing stop 20%/);
  assert.match(wt.runnerAExit({ ...base, heldMin: 20 }).reason, /max hold 20m/);
  assert.equal(wt.runnerAExit(base), null);
});

test('runnerA control is a random token in the same curve band', () => {
  const sig = { mint: 'S', progress: 0.4 };
  const peer = { mint: 'P', progress: 0.55 };
  const young = { mint: 'Y', progress: 0.1 };
  const late = { mint: 'L', progress: 0.9 };
  const taken = { mint: 'T', progress: 0.4, runnerAAt: 1 };
  const grad = { mint: 'G', progress: 0.4, graduated: true };
  assert.equal(wt.pickRunnerAControl([sig, peer, young, late, taken, grad], sig), peer);
  peer.runnerACtlAt = 1;
  assert.equal(wt.pickRunnerAControl([sig, peer], sig), null);
});

test('per-minute buyer and holder series, and bundle net flow', () => {
  const now = NOW;
  const token = runnerTok(now);
  const g = wt.minuteGrowth(token, now);
  assert.equal(g.recentBuyers, 5);
  assert.equal(g.prevBuyers, 2);
  assert.equal(g.buyersRising, true);
  assert.ok(g.buyerSeries.length >= 2);
  assert.ok(g.holderSeries.length >= 2);
  assert.equal(g.buyerSeries.reduce((s, p) => s + p.newBuyers, 0), 7);
  const flowToken = runnerTok(now, { trades: [
    { at: now - 180_000, b: true, w: 'B1', sol: 2, tok: 5, mcap: 30, slot: 10 },
    { at: now - 30_000, b: false, w: 'B1', sol: 0.4, tok: 1, mcap: 30, slot: 40 },
  ] });
  const flow = wt.bundleFlow(flowToken, now);
  assert.equal(flow.wallets, 1);
  assert.equal(flow.netSellers, false);
  assert.ok(flow.recentNetSol < 0);
  assert.ok(flow.series.length >= 1);
  const snap = wt.curveSignalSnapshot(token, now);
  assert.equal(snap.buyersRising, true);
  assert.ok(Array.isArray(snap.buyerSeries) && Array.isArray(snap.holderSeries) && Array.isArray(snap.bundleSeries));
});

test('post-bond top-10 and holder trend, and top-10 from raw balances', () => {
  const up = wt.postBondTrend({ holderPoints: [{ ts: 1, value: 10 }, { ts: 2, value: 12 }], top10Points: [{ ts: 1, value: 20 }, { ts: 2, value: 19.6 }], flatPp: 0.5 });
  assert.equal(up.holdersRising, true);
  assert.equal(up.top10FlatOrFalling, true);
  const down = wt.postBondTrend({ holderPoints: [{ ts: 1, value: 10 }, { ts: 2, value: 10 }], top10Points: [{ ts: 1, value: 20 }, { ts: 2, value: 21 }], flatPp: 0.5 });
  assert.equal(down.holdersRising, false);
  assert.equal(down.top10FlatOrFalling, false);
  const missing = wt.postBondTrend({ holderPoints: [{ ts: 1, value: 10 }] });
  assert.equal(missing.holdersRising, null);
  assert.equal(missing.top10FlatOrFalling, null);
  assert.ok(Math.abs(wt.top10PctFromAmounts([1e14]) - 10) < 1e-6);
  assert.equal(wt.top10PctFromAmounts([]), null);
});

test('holderB entry, its control, and the ramp exclusion', () => {
  const now = NOW;
  const st = (over = {}) => ({
    pairCreatedAt: now - 31 * 60_000, series: floorSeries(now), curveBundlePct: 10, curveCreatorHoldPct: 2, ramp: false, ...over,
  });
  const points = { holderPoints: [{ ts: 1, value: 10 }, { ts: 2, value: 14 }], top10Points: [{ ts: 1, value: 22 }, { ts: 2, value: 21 }] };
  const young = wt.considerHolderB(st({ pairCreatedAt: now - 10 * 60_000 }), { now, ...points });
  assert.equal(young.ready, false);
  const yes = wt.considerHolderB(st(), { now, ...points });
  assert.equal(yes.enter, true);
  assert.equal(yes.control, true);
  const broken = st();
  broken.series = floorSeries(now).map((p, i) => i === 8 ? { ...p, price: 0.5 } : p);
  const noFloor = wt.considerHolderB(broken, { now, ...points });
  assert.equal(noFloor.enter, false);
  assert.equal(noFloor.control, true);
  const noHolders = wt.considerHolderB(st(), { now, holderPoints: points.holderPoints, top10Points: [] });
  assert.equal(noHolders.ready, false);
  assert.equal(noHolders.reason, 'unmeasured');
  const bundled = wt.considerHolderB(st({ curveBundlePct: 40 }), { now, ...points });
  assert.equal(bundled.enter, false);
  const sold = wt.considerHolderB(st({ curveCreatorHoldPct: 0 }), { now, ...points });
  assert.equal(sold.enter, false);
  const ramp = wt.considerHolderB(st({ ramp: true }), { now, ...points });
  assert.equal(ramp.enter, false);
  assert.equal(ramp.control, false);
});

test('holderB exits: half at 2x, stop, 24h; fixed book is unchanged', () => {
  const g = new Graduates();
  const pos = (book, o = {}) => ({ book, sizeSol: 0.2, peak: 0.2, realized: 0, unitsLeft: 1, tp1Done: false, ...o });
  assert.equal(g.exitRule(pos('holderB'), 1.5, 0.3, 10), null);
  assert.equal(g.exitRule(pos('holderB'), 2, 0.4, 10), 'tp1');
  assert.equal(g.exitRule(pos('holderB', { tp1Done: true }), 2.2, 0.3, 10), null);
  assert.equal(g.exitRule(pos('holderB'), 0.615, 0.123, 10), 'stop -38.5%');
  assert.equal(g.exitRule(pos('holderB'), 1.1, 0.22, 360), null);
  assert.equal(g.exitRule(pos('holderB'), 1.1, 0.22, 1440), 'max hold 24h');
  assert.equal(g.exitRule(pos('holderBctl'), 2, 0.4, 30), 'tp1');
  assert.equal(g.exitRule(pos('fixed'), 1.5, 0.3, 10), 'tp1');
  assert.equal(g.exitRule(pos('fixed'), 1.1, 0.22, 360), 'max hold');
  assert.deepEqual(g.books(), ['fixed', 'trail']);
});

test('holderB opens on a qualifying graduate and the control opens on every non-ramp graduate', () => {
  const g = new Graduates();
  g.solUsd = 100;
  const mint = 'HB'.padEnd(44, 'h');
  const ins = db.prepare(`INSERT INTO holder_history (mint, ts, holders, top10_pct) VALUES (?,?,?,?)`);
  ins.run(mint, NOW - 20 * 60_000, 10, 22);
  ins.run(mint, NOW - 60_000, 14, 20);
  const st = {
    mint, symbol: 'HB', pairCreatedAt: NOW - 31 * 60_000, addedAt: NOW - 31 * 60_000, series: floorSeries(NOW),
    last: { t: NOW + 10_000, price: 1, mcap: 50_000, liq: 20_000 }, curveBundlePct: 10, curveCreatorHoldPct: 2, ramp: false,
  };
  g.watch.set(mint, st);
  g.maybeHolder(st, NOW);
  g.paperTick();
  assert.equal(g.open.has(`holderB:${mint}`), true);
  assert.equal(g.open.has(`holderBctl:${mint}`), true);
  assert.equal([...g.open.keys()].some((k) => k.startsWith('fixed:') || k.startsWith('trail:')), false);
  const weak = 'HW'.padEnd(44, 'w');
  ins.run(weak, NOW - 20 * 60_000, 10, 22);
  ins.run(weak, NOW - 60_000, 12, 21);
  const st2 = { ...st, mint: weak, symbol: 'HW', curveBundlePct: 80, holderDecided: null };
  g.watch.set(weak, st2);
  g.maybeHolder(st2, NOW);
  g.paperTick();
  assert.equal(g.open.has(`holderB:${weak}`), false);
  assert.equal(g.open.has(`holderBctl:${weak}`), true);
  const ramp = 'HR'.padEnd(44, 'r');
  const st3 = { ...st, mint: ramp, symbol: 'HR', ramp: true, holderDecided: null, curveBundlePct: 10 };
  g.watch.set(ramp, st3);
  g.maybeHolder(st3, NOW);
  g.paperTick();
  assert.equal(g.open.has(`holderB:${ramp}`), false);
  assert.equal(g.open.has(`holderBctl:${ramp}`), false);
});

test('24h and 72h survival labels', () => {
  const born = NOW - 25 * 3600_000;
  const above = wt.survivalFromSnapshots({ graduatedAt: born, refMcap: 100_000, now: NOW, snapshots: [{ ts: born + 24 * 3600_000 + 1000, mcap: 60_000 }] });
  assert.equal(above.find((r) => r.horizonH === 24).alive, 1);
  assert.equal(above.find((r) => r.horizonH === 72), undefined);
  const below = wt.survivalFromSnapshots({ graduatedAt: born, refMcap: 100_000, now: NOW, snapshots: [{ ts: born + 24 * 3600_000 + 1000, mcap: 40_000 }] });
  assert.equal(below[0].alive, 0);
  const dead = wt.survivalFromSnapshots({ graduatedAt: born, refMcap: 100_000, now: NOW, droppedReason: 'liquidity under $4000', snapshots: [] });
  assert.equal(dead[0].alive, 0);
  const unknown = wt.survivalFromSnapshots({ graduatedAt: born, refMcap: null, now: NOW, snapshots: [{ ts: born + 24 * 3600_000, mcap: 10 }] });
  assert.equal(unknown.length, 0);
  const mint = 'SV'.padEnd(44, 's');
  db.prepare(`INSERT INTO grad_watch (mint, symbol, name, source, added_at, pair_created_at, mig_mcap, active) VALUES (?,?,?,?,?,?,?,1)`).run(mint, 'SV', 'SV', 'migration', born, born, 100_000);
  db.prepare(`INSERT INTO grad_snapshots (mint, ts, price, mcap, liq, score) VALUES (?,?,?,?,?,?)`).run(mint, born + 24 * 3600_000 + 5000, 1, 70_000, 20_000, 10);
  const wrote = wt.recordDueSurvival(NOW);
  assert.ok(wrote >= 1);
  const row = db.prepare(`SELECT alive, mcap, horizon_h FROM survival_labels WHERE mint=? AND horizon_h=24`).get(mint);
  assert.equal(row.alive, 1);
  assert.equal(row.mcap, 70_000);
  assert.equal(wt.recordDueSurvival(NOW), 0);
});

test('kill rule: runnerA uses runnerActl, holderB uses holderBctl, Main still uses random', () => {
  const ins = db.prepare(`INSERT INTO paper_trades (mint,symbol,status,entry_ts,entry_mcap,size_sol,tokens,tokens_left,peak_value,exit_ts,exit_reason,pnl_sol,pnl_pct,events,book,cfg,gap,gated)
    VALUES (?,?,'closed',1,1,0.2,1,0,0.2,?,'test',?,?,'[]',?,?,0,0)`);
  const good = Array.from({ length: 80 }, (_, i) => (i % 3 === 0 ? -15 : 22));
  const bad = Array.from({ length: 60 }, () => -20);
  const put = (book, vals) => vals.forEach((p, i) => ins.run(`${book}${i}`, 'T', NOW + i, (p / 100) * 0.2, p, book, CFG));
  put('runnerA', good);
  put('runnerActl', bad);
  put('random', good);
  put('main', good);
  const a = paper.killRule('runnerA');
  assert.equal(a.status, 'PASS', JSON.stringify(a.checks));
  assert.ok(a.vsControl && a.vsControl.controlAvg < 0);
  assert.equal(paper.killRule('runnerActl').checks.control, null);
  const m = paper.killRule('main');
  assert.equal(m.status, 'MARGINAL');
  assert.ok(m.vsControl && m.vsControl.controlAvg > 0);
  const gins = db.prepare(`INSERT INTO grad_paper (mint,symbol,status,entry_ts,entry_price,entry_mcap,size_sol,units,units_left,peak_value,exit_ts,exit_reason,pnl_sol,pnl_pct,events,book,cfg)
    VALUES (?,?,'closed',1,1,1,0.2,1,0,0.2,?,'test',?,?,'[]',?,?)`);
  const gput = (book, vals) => vals.forEach((p, i) => gins.run(`${book}${i}`, 'T', NOW + i, (p / 100) * 0.2, p, book, CFG));
  gput('holderB', good);
  gput('holderBctl', bad);
  const g = new Graduates();
  const hb = g.kill('holderB');
  assert.equal(hb.status, 'PASS', JSON.stringify(hb.checks));
  assert.ok(hb.vsControl.controlAvg < 0);
  assert.equal(g.kill('holderBctl').checks.control, null);
  assert.equal(g.kill('fixed').checks.control, null);
});

test('engine: dev-sold coin enters runnerA and a band peer enters the control, not Main', () => {
  market.solUsd = 100;
  const engine = new Engine({ pumpportal: null });
  const REAL = 793_100_000, VTOK0 = 1_073_000_000;
  const progress = 0.4, mcapSol = 200;
  const vtok = (1 - progress) * REAL + (VTOK0 - REAL);
  const vsol = mcapSol * vtok / 1e9;
  const born = NOW - 180_000;
  const mint = 'RA'.padEnd(44, 'a');
  const peer = 'RC'.padEnd(44, 'c');
  const creator = 'DV'.padEnd(44, 'd');
  const boot = (id) => {
    engine.onCreate({ mint: id, name: id, symbol: id.slice(0, 4), creator, recvAt: born, slot: 10, quoteIsSol: true, vsol: 30, vtok: VTOK0 });
    const t = engine.getToken(id);
    t.social = { twitter: true, telegram: true, website: true, fetched: true };
    return t;
  };
  const a = boot(mint);
  a.applyTrade({ sig: 'c0', wallet: creator, isBuy: true, sol: 1, tok: 1000, vsol, vtok, recvAt: born + 1000, slot: 100 });
  a.applyTrade({ sig: 'c1', wallet: creator, isBuy: false, sol: 0.6, tok: 600, vsol, vtok, recvAt: born + 2000, slot: 101 });
  for (let i = 0; i < 30; i++) a.applyTrade({ sig: `p${i}`, wallet: `P${i}`.padEnd(40, 'p'), isBuy: true, sol: 0.1, tok: 1000, vsol, vtok, recvAt: NOW - 90_000, slot: 200 });
  for (let i = 0; i < 69; i++) a.applyTrade({ sig: `r${i}`, wallet: `R${i}`.padEnd(40, 'r'), isBuy: true, sol: 0.1, tok: 1000, vsol, vtok, recvAt: NOW - 20_000, slot: 200 });
  a.applyTrade({ sig: 'rlast', wallet: 'R69'.padEnd(40, 'r'), isBuy: true, sol: 0.1, tok: 1000, vsol, vtok, recvAt: NOW - 5_000, slot: 200 });
  const b = boot(peer);
  b.applyTrade({ sig: 'b0', wallet: 'W0'.padEnd(40, 'w'), isBuy: true, sol: 0.1, tok: 1000, vsol, vtok, recvAt: NOW - 90_000, slot: 200 });
  b.applyTrade({ sig: 'b1', wallet: 'W1'.padEnd(40, 'w'), isBuy: true, sol: 0.1, tok: 1000, vsol, vtok, recvAt: NOW - 80_000, slot: 200 });
  engine.evaluate();
  assert.equal(a.runnerAAt, undefined);
  assert.ok(a.runnerScoreSince, 'score clock starts on the first cross');
  const early = db.prepare(`SELECT book FROM paper_trades WHERE mint IN (?,?)`).all(mint, peer);
  assert.equal(early.length, 0);
  adv(R.sustainSec + 1);
  engine.evaluate();
  const live = engine.getToken(mint);
  assert.ok(live.lastScore.raw >= 72, `raw ${live.lastScore.raw} parts ${JSON.stringify(live.lastScore.parts)}`);
  assert.match(live.lastScore.reject, /creator sold/);
  assert.equal(live.lastScore.score, 0);
  assert.equal(live.runnerAAt != null, true);
  adv(P.entryDelaySec + 0.2);
  paper.tick((m) => engine.getToken(m));
  const names = db.prepare(`SELECT book, mint FROM paper_trades WHERE mint IN (?,?) AND status='open'`).all(mint, peer);
  const books = names.map((r) => r.book);
  assert.ok(books.includes('runnerA'), books.join(','));
  assert.ok(books.includes('runnerActl'), books.join(','));
  assert.equal(names.filter((r) => r.book === 'runnerA').every((r) => r.mint === mint), true);
  assert.equal(names.filter((r) => r.book === 'runnerActl').every((r) => r.mint === peer), true);
  assert.ok(!books.includes('main') && !books.includes('capital') && !books.includes('random'), books.join(','));
  const saved = db.prepare(`SELECT COUNT(*) n FROM winner_signals WHERE mint=? AND kind='curve'`).get(mint);
  assert.ok(saved.n >= 1);
  const flags = JSON.parse(db.prepare(`SELECT features FROM paper_trades WHERE mint=? AND book='runnerA'`).get(mint).features);
  assert.ok(flags.runnerFlags.includes('dev-sold'));
});

test('runnerA still sees new buyers and prints after the trade tape is capped', () => {
  const cap = config.lifecycle.maxTradesPerToken;
  const born = NOW - 30 * 60_000;
  const token = new Token({ mint: 'CAP'.padEnd(44, 'c'), name: 'Cap', symbol: 'CAP', creator: 'CR'.padEnd(44, 'r'), recvAt: born, slot: 1, quoteIsSol: true, vsol: 40, vtok: 8e8 });
  token.trades = Array.from({ length: cap }, (_, i) => ({ at: born + i, b: true, w: `old${i}`, sol: 0.01, tok: 1, mcap: 10, sig: `old${i}`, slot: 1 }));
  const vsol = 40, vtok = 8e8;
  for (let i = 0; i < 5; i++) {
    const recvAt = NOW - 5_000;
    const wallet = `N${i}`.padEnd(40, 'n');
    token.applyTrade({ sig: `new${i}`, wallet, isBuy: true, sol: 0.2, tok: 100, vsol, vtok, recvAt, slot: 80 });
    wt.notePrint(token, { at: recvAt, w: wallet, b: true, sol: 0.2, tok: 100, mcap: token.mcap, sig: `new${i}`, slot: 80 });
  }
  assert.equal(token.trades.length, cap);
  assert.equal(token.trades.some((t) => String(t.sig || '').startsWith('new')), false);
  assert.equal(token.recentTrades.length, 5);
  const growth = wt.minuteGrowth(token, NOW);
  assert.equal(growth.recentBuyers, 5);
  assert.equal(growth.buyersRising, true);
  const px = wt.pricePremium(token, NOW, 180);
  assert.equal(px.prints, 5);
  assert.ok(px.premiumPct != null);
  const ctx = wt.curveContext(token, NOW);
  assert.equal(typeof ctx.bundlePct, 'number');
  assert.equal(typeof ctx.creatorHoldPct, 'number');
});

test('holderB waits for measurements and a watchlist drop uses the last price', () => {
  db.prepare(`DELETE FROM grad_paper WHERE status='open'`).run();
  const g = new Graduates();
  g.open.clear();
  g.solUsd = 100;
  const mint = 'HU'.padEnd(44, 'u');
  const st = {
    mint, symbol: 'HU', pairCreatedAt: NOW - 31 * 60_000, addedAt: NOW - 31 * 60_000, series: floorSeries(NOW),
    last: { t: NOW + 10_000, price: 1, mcap: 50_000, liq: 20_000 }, curveBundlePct: 10, curveCreatorHoldPct: 2, ramp: false,
  };
  g.watch.set(mint, st);
  g.maybeHolder(st, NOW);
  g.paperTick();
  assert.equal(st.holderDecided || null, null);
  assert.equal(g.open.has(`holderB:${mint}`), false);
  assert.equal(g.open.has(`holderBctl:${mint}`), false);
  const hist = db.prepare(`INSERT INTO holder_history (mint, ts, holders, top10_pct) VALUES (?,?,?,?)`);
  hist.run(mint, NOW - 20 * 60_000, 10, 22);
  hist.run(mint, NOW - 60_000, 14, 20);
  g.maybeHolder(st, NOW);
  g.paperTick();
  assert.ok(st.holderDecided);
  assert.equal(g.open.has(`holderB:${mint}`), true);

  const closedMint = 'HC'.padEnd(44, 'c');
  const closedId = Number(db.prepare(`INSERT INTO grad_paper (mint,symbol,status,entry_ts,entry_price,entry_mcap,size_sol,units,units_left,realized_sol,peak_value,exit_ts,exit_reason,exit_price,pnl_sol,pnl_pct,events,book,cfg)
    VALUES (?,?, 'closed', ?, ?, ?, ?, ?, 0, 0, ?, ?, 'already closed', 0.1, -0.2, -100, '[]', 'holderBctl', 'oldcfg')`).run(
    closedMint, 'HC', NOW - 5000, 1, 40000, 0.2, 10, 0.2, NOW - 1000,
  ).lastInsertRowid);

  const dropMint = 'HD'.padEnd(44, 'd');
  const dropSt = { mint: dropMint, symbol: 'HD', last: { t: NOW, price: 1.2, mcap: 48000, liq: 18000 } };
  g.watch.set(dropMint, dropSt);
  const dropId = Number(db.prepare(`INSERT INTO grad_paper (mint,symbol,status,entry_ts,entry_price,entry_mcap,size_sol,units,units_left,realized_sol,peak_value,events,book,cfg)
    VALUES (?,?, 'open', ?, ?, ?, ?, ?, ?, 0, ?, '[]', 'holderBctl', ?)`).run(
    dropMint, 'HD', NOW - 60_000, 1, 40000, 0.2, 100, 100, 0.2, CFG,
  ).lastInsertRowid);
  g.open.set(`holderBctl:${dropMint}`, { id: dropId, book: 'holderBctl', mint: dropMint, symbol: 'HD', entryTs: NOW - 60_000, entryPrice: 1, entryMcap: 40000, sizeSol: 0.2, units: 100, unitsLeft: 100, realized: 0, peak: 0.2, tp1Done: false, events: [] });
  g.drop(dropMint, 'liquidity under $4000');
  const dropped = db.prepare(`SELECT status, pnl_pct, exit_reason, exit_price FROM grad_paper WHERE id=?`).get(dropId);
  assert.equal(dropped.status, 'closed');
  assert.equal(dropped.exit_price, 1.2);
  assert.match(dropped.exit_reason, /liquidity under/);
  assert.ok(dropped.pnl_pct > -50, String(dropped.pnl_pct));
  const untouched = db.prepare(`SELECT status, pnl_pct, exit_reason FROM grad_paper WHERE id=?`).get(closedId);
  assert.equal(untouched.status, 'closed');
  assert.equal(untouched.pnl_pct, -100);
  assert.equal(untouched.exit_reason, 'already closed');

  const snapMint = 'HS'.padEnd(44, 's');
  db.prepare(`INSERT INTO grad_snapshots (mint, ts, price, mcap, liq, score) VALUES (?,?,?,?,?,?)`).run(snapMint, NOW, 0.8, 30000, 12000, 1);
  db.prepare(`INSERT INTO grad_watch (mint, symbol, name, source, added_at, active, dropped_reason) VALUES (?,?,?,?,?,0,?)`).run(snapMint, 'HS', 'HS', 'migration', NOW, 'aged out');
  const snapId = Number(db.prepare(`INSERT INTO grad_paper (mint,symbol,status,entry_ts,entry_price,entry_mcap,size_sol,units,units_left,realized_sol,peak_value,events,book,cfg)
    VALUES (?,?, 'open', ?, ?, ?, ?, ?, ?, 0, ?, '[]', 'holderBctl', ?)`).run(
    snapMint, 'HS', NOW - 1000, 1, 40000, 0.2, 80, 80, 0.2, CFG,
  ).lastInsertRowid);
  g.open.set(`holderBctl:${snapMint}`, { id: snapId, book: 'holderBctl', mint: snapMint, symbol: 'HS', entryTs: NOW - 1000, entryPrice: 1, entryMcap: 40000, sizeSol: 0.2, units: 80, unitsLeft: 80, realized: 0, peak: 0.2, tp1Done: false, events: [] });
  const bare = 'HZ'.padEnd(44, 'z');
  g.open.set(`holderB:${bare}`, { id: 987654, book: 'holderB', mint: bare, symbol: 'HZ', entryTs: NOW, entryPrice: 1, entryMcap: 1, sizeSol: 0.2, units: 1, unitsLeft: 1, realized: 0, peak: 0.2, tp1Done: false, events: [] });
  g.paperTick();
  const snapped = db.prepare(`SELECT status, exit_price, exit_reason, pnl_pct FROM grad_paper WHERE id=?`).get(snapId);
  assert.equal(snapped.status, 'closed');
  assert.equal(snapped.exit_price, 0.8);
  assert.match(snapped.exit_reason, /aged out/);
  assert.ok(snapped.pnl_pct > -90, String(snapped.pnl_pct));
  assert.equal(g.open.has(`holderB:${bare}`), true, 'no last price stays open instead of booking -100%');
  const stillClosed = db.prepare(`SELECT pnl_pct, exit_reason FROM grad_paper WHERE id=?`).get(closedId);
  assert.equal(stillClosed.pnl_pct, -100);
  assert.equal(stillClosed.exit_reason, 'already closed');
});

test('join-labels reads a db copy and does not write it', () => {
  const root = path.resolve(new URL('..', import.meta.url).pathname);
  const copy = path.join(dir, 'copy.db');
  const csv = path.join(dir, 'labels.csv');
  const out = path.join(dir, 'joined.json');
  const fixture = new Database(copy);
  fixture.exec(`CREATE TABLE tokens (mint TEXT PRIMARY KEY, symbol TEXT, name TEXT, creator TEXT, created_at INTEGER, graduated INTEGER, graduated_at INTEGER, peak_mcap_1h REAL, mcap_1h REAL, rugged INTEGER);
    CREATE TABLE paper_trades (id INTEGER PRIMARY KEY, mint TEXT, status TEXT, pnl_sol REAL, pnl_pct REAL);
    CREATE TABLE winner_signals (mint TEXT, ts INTEGER, kind TEXT, payload TEXT, PRIMARY KEY (mint, ts, kind));
    CREATE TABLE survival_labels (mint TEXT, horizon_h INTEGER, ts INTEGER, alive INTEGER, mcap REAL, ref_mcap REAL, source TEXT, PRIMARY KEY (mint, horizon_h));`);
  const mint = 'JJ'.padEnd(44, 'j');
  fixture.prepare(`INSERT INTO tokens (mint, symbol, name, created_at, graduated) VALUES (?,?,?,?,1)`).run(mint, 'JJ', 'Jay', 10);
  fixture.prepare(`INSERT INTO paper_trades (mint, status, pnl_sol, pnl_pct) VALUES (?,?,?,?)`).run(mint, 'closed', -0.1, -50);
  fixture.prepare(`INSERT INTO winner_signals (mint, ts, kind, payload) VALUES (?,?,?,?)`).run(mint, 10, 'curve', '{"buyersRising":true}');
  fixture.prepare(`INSERT INTO survival_labels (mint, horizon_h, ts, alive, mcap, ref_mcap, source) VALUES (?,?,?,?,?,?,?)`).run(mint, 24, 20, 1, 80000, 100000, 'grad_snapshots');
  fixture.close();
  fs.writeFileSync(csv, `mint,chain,label,label_time,peak_mc,peak_time,bond_time,mc_24h,source_url,notes\n${mint},solana,runner,2026-10-01T00:00:00Z,120000,2026-10-01T01:00:00Z,2026-10-01T00:30:00Z,80000,https://example.invalid/x,"note, with comma"\nNOTAMINT,solana,dead,2026-10-02,1,,,1,,\n`);
  const winners = path.join(dir, 'winners.csv');
  const rugs = path.join(dir, 'rug-cases.csv');
  fs.writeFileSync(winners, `track,mint,symbol,launch_utc,peak_mc,minutes_to_peak,mc_24h,mc_7d,bonded,early_signals,source_url\nfast,${mint},JJ,2026-10-01T00:00:00Z,150000,30,80000,10000,true,buyers rising,https://example.invalid/w\nonlywin,${'WW'.padEnd(44, 'w')},WW,2026-10-03T00:00:00Z,90000,10,20000,5000,false,spread,https://example.invalid/ww\n`);
  fs.writeFileSync(rugs, `mint,symbol,launch_utc,peak_mc,reason,source_url\n${mint},JJ,2026-10-01T00:00:00Z,150000,sniped,https://example.invalid/r\n`);
  const before = createHash('sha256').update(fs.readFileSync(copy)).digest('hex');
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/join-labels.js'), '--db', copy, '--csv', csv, '--csv', winners, '--csv', rugs, '--out', out], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(createHash('sha256').update(fs.readFileSync(copy)).digest('hex'), before);
  const report = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(report.readonly, true);
  assert.equal(report.rows, 3);
  assert.equal(report.matched, 1);
  assert.equal(report.unmatched, 2);
  assert.equal(report.duplicateMints, 1);
  assert.equal(report.closedPaperRowsRead, 1);
  const hit = report.items.find((r) => r.mint === mint);
  assert.equal(hit.token.symbol, 'JJ');
  assert.equal(hit.notes, 'note, with comma');
  assert.equal(hit.survival[0].alive, 1);
  assert.equal(hit.signals[0].payload.buyersRising, true);
  assert.equal(hit.conflict, true);
  assert.match(hit.label, /runner/);
  assert.match(hit.label, /rug/);
  assert.ok(hit.sourceFiles.includes('winners.csv') && hit.sourceFiles.includes('rug-cases.csv'));
  const only = report.items.find((r) => r.symbol === 'WW');
  assert.equal(only.label, 'onlywin');
  assert.equal(only.mc_7d, '5000');
  assert.equal(only.bonded, 'false');
  const src = fs.readFileSync(path.join(root, 'scripts/join-labels.js'), 'utf8');
  assert.equal(/from '\.\.\/src\//.test(src), false);
  assert.equal(/\b(INSERT|UPDATE|DELETE)\b/.test(src), false);
  const refused = spawnSync(process.execPath, [path.join(root, 'scripts/join-labels.js'), '--db', '/opt/curvewatch/data/curvewatch.db', '--csv', csv], { encoding: 'utf8' });
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /refusing production path/);
});

Date.now = realNow;
db.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`${n} winner-tracks tests passed`);
process.exit(0);
