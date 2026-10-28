// Bundle detection, rug-zone fit, and GET /api/risk/:mint.
// Synthetic fixtures only. Does not read ./data or a production database.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-test-'));
process.env.DATA_DIR = dir;
process.env.LOG_LEVEL = 'error';
for (const key of ['HELIUS_API_KEY', 'TELEGRAM_BOT_TOKEN', 'BUNDLE_RUG_MODEL', 'DASHBOARD_PASSWORD', 'MAX_BUNDLE_PCT', 'DIGITALOCEAN_TOKEN']) {
  delete process.env[key];
}
assert.equal(fs.existsSync(path.join(root, '.env')), false, 'tests require a tree with no .env');

const {
  SCORER_RULES, TOTAL_SUPPLY, coefficientOfVariation, detectBundles, labelMajoritySell, mcapOf,
} = await import('../src/bundle/detect.js');
const {
  PROSPECTIVE, fitRugModel, judgeProspective, loadModelFile, modelId, parseModel,
} = await import('../src/bundle/model.js');
const {
  DISCLAIMER, MINT_RE, PRE_REGISTRATION, assertReadableCopy, assertWritableOutput, buildRiskPayload, openReadonly, scoreLoggedPredictions,
} = await import('../src/bundle/risk.js');
const { loadMint, registerRiskRoute, clearRiskCaches } = await import('../src/bundle/http.js');
const { Token } = await import('../src/engine/token.js');
const { CURVE } = await import('../src/config.js');
const { mcapOf: utilMcap } = await import('../src/util.js');
const { default: Database } = await import('better-sqlite3');

let n = 0;
const test = (name, fn) => {
  fn();
  n += 1;
  console.log('ok', name);
};
const testAsync = async (name, fn) => {
  await fn();
  n += 1;
  console.log('ok', name);
};

const pad = (ch) => ch.repeat(32);
const buy = (wallet, sol, tok, extra = {}) => ({ ts: 1_000, slot: 10, sig: `${wallet}-${extra.ts || 0}-${sol}`, wallet, isBuy: 1, sol, tok, vsol: 30, vtok: 1_073_000_000, ...extra });

test('supply constant and market cap match the curve module', () => {
  assert.equal(TOTAL_SUPPLY, CURVE.TOTAL_SUPPLY);
  assert.equal(mcapOf(30, CURVE.INITIAL_VTOKENS), utilMcap(30, CURVE.INITIAL_VTOKENS));
  assert.equal(SCORER_RULES.minBundleWallets, 3);
  assert.equal(SCORER_RULES.partialBundleBuyVolumePct, 25);
  assert.equal(SCORER_RULES.defaultBundleBuyVolumePct, 55);
  const score = fs.readFileSync('src/engine/score.js', 'utf8');
  assert.match(score, /bundleWallets >= 3/);
  assert.match(score, /bundlePct >= 25/);
});

test('same-slot and next-slot buys match the in-memory scorer on an ordered tape', () => {
  const creator = pad('C');
  const a = pad('A');
  const b = pad('B');
  const later = pad('D');
  const token = new Token({ mint: pad('M'), creator, recvAt: 1_000_000, slot: 50, vsol: 30, vtok: CURVE.INITIAL_VTOKENS });
  const rows = [
    { sig: 'c', wallet: creator, isBuy: true, sol: 1, tok: 100, slot: 50, recvAt: 1_000_100, vsol: 31, vtok: 1e9 },
    { sig: 'a', wallet: a, isBuy: true, sol: 2, tok: 200, slot: 50, recvAt: 1_000_200, vsol: 33, vtok: 1e9 },
    { sig: 'b', wallet: b, isBuy: true, sol: 3, tok: 300, slot: 51, recvAt: 1_000_400, vsol: 36, vtok: 1e9 },
    { sig: 'd', wallet: later, isBuy: true, sol: 4, tok: 400, slot: 55, recvAt: 1_002_000, vsol: 40, vtok: 1e9 },
  ];
  for (const row of rows) token.applyTrade(row);
  const features = token.features();
  const detected = detectBundles({ trades: token.trades, createdAt: token.createdAt, createSlot: token.createSlot, creator });
  assert.equal(detected.bundle.walletCount, features.bundleWallets);
  assert.ok(Math.abs(detected.bundle.buyVolumeSharePct - features.bundlePct) < 1e-9);
  assert.equal(detected.bundle.walletCount, 2);
  assert.equal(detected.method, 'create-slot-plus-one');
  assert.ok(detected.bundle.wallets.every((w) => w.address !== creator));
});

test('a same-slot buy that arrives after a later slot is still counted', () => {
  const late = buy(pad('A'), 2, 100, { ts: 3_000, slot: 10, sig: 'late' });
  const after = buy(pad('B'), 9, 100, { ts: 2_000, slot: 20, sig: 'after' });
  const detected = detectBundles({
    trades: [after, late],
    createdAt: 1_000,
    createSlot: 10,
    creator: pad('C'),
  });
  assert.deepEqual(detected.bundle.wallets.map((w) => w.address), [pad('A')]);
  assert.equal(detected.bundle.solBought, 2);
});

test('missing create slot uses the 1500 ms window and still drops the creator', () => {
  const createdAt = 5_000;
  const creator = pad('C');
  const trades = [
    buy(creator, 5, 10, { ts: createdAt + 50, slot: null, sig: 'dev' }),
    buy(pad('A'), 1, 10, { ts: createdAt + 100, slot: null, sig: 'a' }),
    buy(pad('B'), 1, 10, { ts: createdAt + 1_400, slot: null, sig: 'b' }),
    buy(pad('D'), 4, 10, { ts: createdAt + 1_600, slot: null, sig: 'd' }),
  ];
  const detected = detectBundles({ trades, createdAt, createSlot: null, creator });
  assert.equal(detected.method, 'time-fallback-1500ms');
  assert.equal(detected.bundle.walletCount, 2);
  assert.equal(detected.bundle.solBought, 2);
  assert.equal(detected.clusters[0].kind, 'time-window');
});

test('sold tokens, supply share, and a holder-map override are reported', () => {
  const wallet = pad('A');
  const trades = [
    buy(wallet, 2, 24_000_000, { ts: 100, sig: 'buy' }),
    { ts: 500, slot: 15, sig: 'sell', wallet, isBuy: 0, sol: 1, tok: 6_000_000, vsol: 28, vtok: 1e9 },
  ];
  const detected = detectBundles({ trades, createdAt: 50, createSlot: 10, creator: pad('C') });
  const row = detected.bundle.wallets[0];
  assert.equal(row.soldTokens, 6_000_000);
  assert.equal(row.soldPct, 25);
  assert.equal(row.stillHeldTokens, 18_000_000);
  assert.ok(Math.abs(row.supplyHeldPct - 1.8) < 1e-9);
  const overridden = detectBundles({
    trades, createdAt: 50, createSlot: 10, creator: pad('C'), holders: new Map([[wallet, 1_000]]),
  });
  assert.equal(overridden.bundle.wallets[0].stillHeldTokens, 1_000);
  assert.equal(overridden.bundle.soldPct, 25);
});

test('coordinated sizes are a cluster and are not added into bundle totals', () => {
  const createdAt = 0;
  const trades = [0, 1, 2].map((i) => buy(pad(String(i)), 1, 1_000, { ts: 3_000 + i * 100, slot: 30, sig: `c${i}` }));
  const detected = detectBundles({ trades, createdAt, createSlot: 10, creator: pad('C') });
  assert.equal(detected.bundle.solBought, 0);
  assert.equal(detected.bundle.walletCount, 0);
  const coord = detected.clusters.find((c) => c.kind === 'coordinated-timing');
  assert.equal(coord.measured, true);
  assert.equal(coord.walletCount, 3);
  assert.equal(coord.solBought, 3);
  const inside = [0, 1, 2].map((i) => buy(pad(`S${i}`), 1.1, 1_000, { ts: 100 + i * 50, slot: 10, sig: `s${i}` }));
  const both = detectBundles({ trades: inside, createdAt, createSlot: 10, creator: pad('C') });
  assert.ok(Math.abs(both.bundle.solBought - 3.3) < 1e-9);
  assert.equal(both.clusters.find((c) => c.kind === 'coordinated-timing').walletCount, 3);
  const slotSol = both.clusters.filter((c) => c.kind === 'same-slot').reduce((s, c) => s + c.solBought, 0);
  assert.ok(Math.abs(slotSol - both.bundle.solBought) < 1e-9);
});

test('uneven sizes do not become a coordinated cluster', () => {
  const trades = [
    buy(pad('A'), 0.1, 10, { ts: 100, sig: 'a' }),
    buy(pad('B'), 0.1, 10, { ts: 150, sig: 'b' }),
    buy(pad('D'), 5, 10, { ts: 200, sig: 'd' }),
  ];
  const detected = detectBundles({ trades, createdAt: 0, createSlot: 10, creator: pad('C') });
  assert.equal(detected.coordination.found, false);
  assert.equal(detected.clusters.some((c) => c.kind === 'coordinated-timing'), false);
});

test('shared funders are reported only from a provided map and are not added to totals', () => {
  const wallets = [pad('A'), pad('B'), pad('D')];
  const trades = wallets.map((wallet, i) => buy(wallet, 1, 1_000, { ts: 100 + i, sig: `f${i}` }));
  const none = detectBundles({ trades, createdAt: 0, createSlot: 10, creator: pad('C'), funders: null });
  const placeholder = none.clusters.find((c) => c.kind === 'shared-funder');
  assert.equal(placeholder.measured, false);
  assert.equal(placeholder.wallets.length, 0);
  assert.equal(none.funders.reason, 'missing');
  const funders = new Map([[wallets[0], pad('F')], [wallets[1], pad('F')], [wallets[2], pad('G')]]);
  const detected = detectBundles({ trades, createdAt: 0, createSlot: 10, creator: pad('C'), funders });
  const cluster = detected.clusters.find((c) => c.kind === 'shared-funder' && c.measured);
  assert.equal(cluster.walletCount, 2);
  assert.equal(detected.bundle.solBought, 3);
  assert.equal(detected.funders.measured, true);
  assert.ok(cluster.wallets.every((w) => w.funder === pad('F')));
});

test('duplicate signatures are counted once', () => {
  const row = buy(pad('A'), 2, 100, { sig: 'same' });
  const detected = detectBundles({ trades: [row, { ...row }], createdAt: 0, createSlot: 10, creator: pad('C') });
  assert.equal(detected.bundle.solBought, 2);
  assert.equal(detected.tradeCount, 1);
});

test('majority-sell label is the market cap where launch inventory falls to half', () => {
  const trades = [
    { ts: 1, wallet: 'A', isBuy: true, sol: 1, tok: 100, vsol: 10, vtok: 1e9, slot: 1, sig: 'ba' },
    { ts: 2, wallet: 'B', isBuy: true, sol: 1, tok: 100, vsol: 11, vtok: 1e9, slot: 1, sig: 'bb' },
    { ts: 3, wallet: 'A', isBuy: false, sol: 1, tok: 40, vsol: 15, vtok: 1e9, slot: 4, sig: 'sa' },
    { ts: 4, wallet: 'B', isBuy: false, sol: 1, tok: 70, vsol: 25, vtok: 1e9, slot: 5, sig: 'sb' },
  ];
  const positions = [{ address: 'A', tokensBought: 100 }, { address: 'B', tokensBought: 100 }];
  const label = labelMajoritySell(trades, positions);
  assert.equal(label.mcapSol, 25);
  assert.equal(label.ts, 4);
  assert.equal(labelMajoritySell(trades.slice(0, 3), positions), null);
  const carried = labelMajoritySell([
    trades[0], trades[1],
    { ts: 3, wallet: 'A', isBuy: false, sol: 1, tok: 100, vsol: 0, vtok: 0, slot: 4, sig: 'sz' },
  ], positions);
  assert.equal(carried.mcapSol, 11);
  assert.equal(labelMajoritySell([
    { ts: 3, wallet: 'A', isBuy: false, sol: 1, tok: 100, vsol: 0, vtok: 0, slot: 4, sig: 'no' },
  ], [{ address: 'A', tokensBought: 100 }]), null);
});

test('hard reject and partial flag use the scorer thresholds', () => {
  const rules = { bundleBuyVolumePct: 55, minBundleWallets: 3, partialBundleBuyVolumePct: 25 };
  const three = [pad('A'), pad('B'), pad('D')].map((wallet, i) => buy(wallet, 6, 1_000, { ts: 10 + i, sig: `h${i}` }));
  three.push(buy(pad('E'), 4, 10, { ts: 9_000, slot: 40, sig: 'later' }));
  const hard = buildRiskPayload({
    mint: pad('1'), now: 20_000, rules, model: null,
    meta: { name: 'H', symbol: 'H', creator: pad('C'), createdAt: 0, createSlot: 10, quoteOk: true },
    trades: three, funders: null, source: 'memory',
  }).body;
  assert.equal(hard.bundle.hardReject, true);
  assert.equal(hard.bundle.partialFlag, true);
  assert.ok(hard.bundle.buyVolumeSharePct > 55);
  const pair = [pad('A'), pad('B')].map((wallet, i) => buy(wallet, 10, 1_000, { ts: 10 + i, sig: `p${i}` }));
  const partial = buildRiskPayload({
    mint: pad('1'), now: 20_000, rules, model: null,
    meta: { name: 'P', symbol: 'P', creator: pad('C'), createdAt: 0, createSlot: 10, quoteOk: true },
    trades: pair, funders: null, source: 'memory',
  }).body;
  assert.equal(partial.bundle.hardReject, false);
  assert.equal(partial.bundle.partialFlag, true);
  assert.equal(partial.validated, false);
  assert.equal(partial.rugZone.status, 'unavailable');
  assert.equal(partial.rugZone.validated, false);
  assert.equal(partial.rugZone.confidence, null);
});

test('released detail returns null bundle totals and does not invent a band', () => {
  const { body } = buildRiskPayload({
    mint: pad('1'), now: 10_000, lite: true, source: 'none', model: null,
    meta: { name: 'Old', symbol: 'OLD', creator: pad('C'), createdAt: 1_000, createSlot: 4, quoteOk: true, graduated: false, mcapSol: 12, peakMcapSol: 14, progressPct: 3 },
    trades: [buy(pad('A'), 9, 1, { sig: 'ignored' })],
  });
  assert.equal(body.token.lite, true);
  assert.equal(body.coverage.detail, 'released');
  assert.equal(body.coverage.method, 'unavailable');
  assert.equal(body.bundle.walletCount, null);
  assert.equal(body.bundle.buyVolumeSharePct, null);
  assert.equal(body.bundle.hardReject, null);
  assert.equal(body.token.mcapSol, 12);
  assert.equal(body.clusters[0].measured, false);
  assert.equal(body.mode, 'live');
  assert.equal(body.illustrative, false);
  assert.equal(body.contract, 'risk.v1');
  assert.equal(body.disclaimer, DISCLAIMER);
});

function frozenModel() {
  const parsed = parseModel({
    method: 'bundle-rug-mcap-v1',
    frozenAt: '2026-10-28T00:00:00.000Z',
    coefficients: { intercept: 3, logSupplyBoughtPct: 0.2, logWalletCount: 0.1, sizeCv: -0.1 },
    residualQuantiles: { q10: -0.4, q90: 0.4 },
    train: { n: 30, medAbsLog: 0.2, endAt: 1 },
  });
  return { ...parsed, id: modelId(parsed) };
}

test('a frozen model returns an unvalidated band until the prospective check passes', () => {
  const model = frozenModel();
  const trades = [pad('A'), pad('B'), pad('D')].map((wallet, i) => buy(wallet, 1, 24_000_000, { ts: 100 + i, sig: `u${i}` }));
  const { body, prediction } = buildRiskPayload({
    mint: pad('1'), now: 5_000, model,
    prospective: { pass: false, labeled: 0, required: 50, coverage: null, overCap: false },
    meta: { name: 'U', symbol: 'U', creator: pad('C'), createdAt: 0, createSlot: 10, quoteOk: true, mcapSol: 28, peakMcapSol: 30, progressPct: 11.2 },
    trades, funders: null, holders: new Map(trades.map((t) => [t.wallet, t.tok])), source: 'memory', solUsd: 150,
  });
  assert.equal(body.validated, false);
  assert.equal(body.rugZone.status, 'unvalidated');
  assert.equal(body.rugZone.method, 'bundle-rug-mcap-v1');
  assert.equal(body.rugZone.validated, false);
  assert.equal(body.rugZone.confidence, null);
  assert.ok(body.rugZone.mcapSol.low < body.rugZone.mcapSol.high);
  assert.ok(body.rugZone.mcapUsd.low < body.rugZone.mcapUsd.high);
  assert.equal(body.signals.coordinatedTiming.status, 'measured-as-slot-window');
  assert.equal(body.signals.sharedFunders.status, 'not-collected');
  assert.ok(prediction.features.wallets.length === 3);
  assert.equal(body.rules.minBundleWallets, 3);
  assert.equal(body.bundle.soldPct, 0);
});

test('non-SOL quotes do not get a market-cap band', () => {
  const trades = [pad('A'), pad('B'), pad('D')].map((wallet, i) => ({
    ts: 100 + i, slot: 10, sig: `q${i}`, wallet, isBuy: 1, sol: 0, tok: 1_000, vsol: 0, vtok: 0,
  }));
  const { body, prediction } = buildRiskPayload({
    mint: pad('1'), now: 1_000, model: frozenModel(),
    meta: { name: 'Q', symbol: 'Q', creator: pad('C'), createdAt: 0, createSlot: 10 },
    trades, source: 'stored-trades',
  });
  assert.equal(body.token.quoteOk, false);
  assert.equal(body.token.mcapSol, null);
  assert.equal(body.rugZone.status, 'unavailable');
  assert.equal(prediction, null);
});

test('time-ordered fit recovers a planted line and refuses a short sample', () => {
  const rows = [];
  for (let i = 0; i < 48; i++) {
    const supplyBoughtPct = 1 + (i % 5);
    const walletCount = 3 + (i % 4);
    const sizeCv = ((i * 3) % 7) * 0.05;
    const createdAt = 1_000_000 + i * 1_000;
    const labelMcap = Math.exp(2 + 0.5 * Math.log(supplyBoughtPct) + 0.2 * Math.log(walletCount) - 0.3 * sizeCv);
    rows.push({ mint: `m${i}`, createdAt, supplyBoughtPct, walletCount, sizeCv, labelMcap });
  }
  const shuffled = [...rows].reverse();
  const fit = fitRugModel(shuffled, { frozenAt: '2026-10-28T00:00:00.000Z' });
  assert.equal(fit.ok, true);
  assert.equal(fit.validated, false);
  assert.ok(Math.abs(fit.model.coefficients.logSupplyBoughtPct - 0.5) < 1e-6);
  assert.ok(Math.abs(fit.model.coefficients.logWalletCount - 0.2) < 1e-6);
  assert.ok(Math.abs(fit.model.coefficients.sizeCv + 0.3) < 1e-6);
  assert.ok(fit.split.trainEnd < fit.split.testStart);
  assert.ok(fit.test.coverage >= 0.99);
  const short = fitRugModel(rows.slice(0, 8));
  assert.equal(short.ok, false);
  assert.equal(short.reason, 'insufficient');
  assert.equal(short.validated, false);
});

test('prospective check stays false until fifty later labels land inside the logged band', () => {
  const good = (i) => ({ predSol: 10, low: 8, high: 12, labelMcap: 10, labelTs: 2_000 + i, observedAt: 1_000 });
  assert.equal(judgeProspective(Array.from({ length: 49 }, (_, i) => good(i)), 0.2).pass, false);
  const passed = judgeProspective(Array.from({ length: 50 }, (_, i) => good(i)), 0.2);
  assert.equal(passed.pass, true);
  assert.equal(passed.labeled, 50);
  assert.ok(passed.coverage >= PROSPECTIVE.minCoverage);
  const early = Array.from({ length: 50 }, (_, i) => ({ ...good(i), labelTs: 500 }));
  assert.equal(judgeProspective(early, 0.2).labeled, 0);
  const wide = Array.from({ length: 50 }, (_, i) => ({ ...good(i), labelMcap: i % 2 ? 100 : 10 }));
  assert.equal(judgeProspective(wide, 0.2).pass, false);
  const sloppy = Array.from({ length: 50 }, (_, i) => ({ ...good(i), predSol: 10, labelMcap: 10 }));
  const far = sloppy.map((row, i) => ({ ...row, predSol: 1, labelMcap: 10, low: 8, high: 12 }));
  assert.equal(judgeProspective(far, 0.01).pass, false);
  assert.equal(judgeProspective(Array.from({ length: 1001 }, (_, i) => good(i)), 0.2).overCap, true);
  assert.equal(judgeProspective(Array.from({ length: 1001 }, (_, i) => good(i)), 0.2).pass, false);
  const looseFile = parseModel({
    method: 'bundle-rug-mcap-v1',
    frozenAt: '2026-10-28T00:00:00.000Z',
    coefficients: { intercept: 0, logSupplyBoughtPct: 0, logWalletCount: 0, sizeCv: 0 },
    residualQuantiles: { q10: -1, q90: 1 },
    train: { medAbsLog: 1e9, n: 1 },
    prospective: { minN: 1 },
  });
  assert.ok(looseFile);
  assert.equal(PROSPECTIVE.minN, 50);
});

test('stored tape and bundle_funders are read without inventing parents', () => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE tokens (mint TEXT PRIMARY KEY, name TEXT, symbol TEXT, creator TEXT, created_at INTEGER, create_slot INTEGER, graduated INTEGER);
    CREATE TABLE trades (mint TEXT, ts INTEGER, slot INTEGER, sig TEXT, wallet TEXT, is_buy INTEGER, sol REAL, tok REAL, vsol REAL, vtok REAL);
    CREATE TABLE bundle_funders (wallet TEXT, funder TEXT);`);
  const mint = pad('1');
  const creator = pad('C');
  const wallets = [pad('A'), pad('B'), pad('D')];
  db.prepare('INSERT INTO tokens VALUES (?,?,?,?,?,?,0)').run(mint, 'Stored', 'ST', creator, 1_000, 10);
  const ins = db.prepare('INSERT INTO trades VALUES (?,?,?,?,?,?,?,?,?,?)');
  wallets.forEach((wallet, i) => ins.run(mint, 1_100 + i, 10, `s${i}`, wallet, 1, 1, 1_000, 30, 1_073_000_000));
  ins.run(mint, 5_000, 20, 'sell', wallets[0], 0, 1, 600, 40, 1e9);
  db.prepare('INSERT INTO bundle_funders VALUES (?,?)').run(wallets[0], pad('F'));
  db.prepare('INSERT INTO bundle_funders VALUES (?,?)').run(wallets[1], pad('F'));
  const loaded = loadMint(db, null, mint);
  assert.equal(loaded.source, 'stored-trades');
  assert.equal(loaded.lite, false);
  assert.equal(loaded.funders.get(wallets[0]), pad('F'));
  const { body } = buildRiskPayload({ mint, now: 9_000, model: null, ...loaded });
  assert.equal(body.token.name, 'Stored');
  assert.equal(body.signals.sharedFunders.status, 'measured');
  assert.equal(body.bundle.walletCount, 3);
  assert.equal(body.bundle.solBought, 3);
  const liveMint = pad('8');
  const engine = { getToken: (asked) => (asked === liveMint ? { lite: true, quoteOk: true, name: 'Live', symbol: 'L', creator, createdAt: 1_000, createSlot: 10, graduated: false } : null) };
  assert.equal(loadMint(db, engine, pad('7')), null);
  const released = loadMint(db, engine, liveMint);
  assert.equal(released.lite, true);
  assert.equal(released.meta.name, 'Live');
  db.prepare('INSERT INTO tokens VALUES (?,?,?,?,?,?,1)').run(pad('9'), 'Gone', 'G', creator, 1_000, 3);
  const gone = loadMint(db, null, pad('9'));
  assert.equal(gone.lite, true);
  assert.equal(gone.trades.length, 0);
  db.close();
});

test('score uses the frozen wallet list and ignores a sell that already happened', () => {
  const db = new Database(':memory:');
  const model = frozenModel();
  db.exec(`CREATE TABLE trades (mint TEXT, ts INTEGER, slot INTEGER, sig TEXT, wallet TEXT, is_buy INTEGER, sol REAL, tok REAL, vsol REAL, vtok REAL);
    CREATE TABLE bundle_risk_log (mint TEXT NOT NULL, model TEXT NOT NULL, observed_at INTEGER NOT NULL, pred_sol REAL, low_sol REAL, high_sol REAL, features TEXT NOT NULL, PRIMARY KEY (mint, model));`);
  const ins = db.prepare('INSERT INTO trades VALUES (?,?,?,?,?,?,?,?,?,?)');
  ins.run('future', 5_000, 20, 'sf', 'A', 0, 1, 100, 22, 1e9);
  ins.run('past', 500, 20, 'sp', 'A', 0, 1, 100, 22, 1e9);
  const features = JSON.stringify({ wallets: [{ address: 'A', tokensBought: 100 }, { address: 'B', tokensBought: 100 }] });
  db.prepare('INSERT INTO bundle_risk_log VALUES (?,?,?,?,?,?,?)').run('future', model.id, 1_000, 20, 10, 30, features);
  db.prepare('INSERT INTO bundle_risk_log VALUES (?,?,?,?,?,?,?)').run('past', model.id, 1_000, 20, 10, 30, features);
  const scored = scoreLoggedPredictions(db, model);
  assert.equal(scored.labeled, 1);
  assert.equal(scored.pass, false);
  db.close();
});

test('path guards refuse the production database and ./data', () => {
  assert.throws(() => assertReadableCopy('/opt/curvewatch/data/curvewatch.db'), (e) => e.code === 'REFUSED');
  assert.throws(() => assertReadableCopy(path.join(root, 'data', 'curvewatch.db')), (e) => e.code === 'REFUSED');
  assert.throws(() => assertWritableOutput(path.join(root, 'data', 'model.json'), path.join(dir, 'copy.db')), (e) => e.code === 'REFUSED');
  assert.throws(() => assertWritableOutput('/opt/curvewatch/model.json', path.join(dir, 'copy.db')), (e) => e.code === 'REFUSED');
  const copy = path.join(dir, 'guard.db');
  const db = new Database(copy);
  db.exec('CREATE TABLE t (a INTEGER)');
  db.pragma('journal_mode = DELETE');
  db.close();
  assert.throws(() => assertWritableOutput(copy, copy), (e) => e.code === 'REFUSED');
  const before = createHash('sha256').update(fs.readFileSync(copy)).digest('hex');
  const ro = openReadonly(copy);
  assert.throws(() => ro.exec('CREATE TABLE nope (a)'));
  ro.close();
  assert.equal(createHash('sha256').update(fs.readFileSync(copy)).digest('hex'), before);
});

function plantCopy(file) {
  const db = new Database(file);
  db.pragma('journal_mode = DELETE');
  db.exec(`CREATE TABLE tokens (mint TEXT PRIMARY KEY, name TEXT, symbol TEXT, creator TEXT, created_at INTEGER, create_slot INTEGER, graduated INTEGER);
    CREATE TABLE trades (mint TEXT, ts INTEGER, slot INTEGER, sig TEXT, wallet TEXT, is_buy INTEGER, sol REAL, tok REAL, vsol REAL, vtok REAL);`);
  const token = db.prepare('INSERT INTO tokens VALUES (?,?,?,?,?,?,0)');
  const trade = db.prepare('INSERT INTO trades VALUES (?,?,?,?,?,?,?,?,?,?)');
  const base = 1_700_000_000_000;
  const creator = 'creator-wallet';
  for (let i = 0; i < 48; i++) {
    const walletCount = 3 + (i % 4);
    const tilt = i % 5;
    const scale = 1 + (Math.floor(i / 7) % 3) * 0.5;
    const weights = Array.from({ length: walletCount }, (_, k) => (k === 0 ? 5 + tilt : 1));
    const sols = weights.map((w) => w * scale);
    const toks = sols.map((s) => s * 1_000_000);
    const supply = (toks.reduce((a, b) => a + b, 0) / TOTAL_SUPPLY) * 100;
    const sizeCv = coefficientOfVariation(sols);
    const label = Math.exp(1.5 + 0.35 * Math.log(supply) + 0.1 * Math.log(walletCount) - 0.2 * sizeCv);
    const created = base + i * 60_000;
    const mint = `plant-${String(i).padStart(4, '0')}`;
    token.run(mint, `N${i}`, `S${i}`, creator, created, 1000);
    sols.forEach((sol, k) => trade.run(mint, created + 50 + k, 1000, `b${i}-${k}`, `w${i}-${k}`, 1, sol, toks[k], 30, 1_073_000_000));
    trade.run(mint, created + 30_000, 2000, `s${i}`, `w${i}-0`, 0, 1, toks[0], label, 1_000_000_000);
  }
  db.close();
}

function runScript(args) {
  try {
    const stdout = execFileSync(process.execPath, ['scripts/bundle-rug-backtest.js', ...args], {
      cwd: root, encoding: 'utf8', env: { ...process.env, DATA_DIR: dir },
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return { code: e.status, stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || '' };
  }
}

test('offline script fits a copy, leaves the file unchanged, and stays unvalidated', () => {
  const copy = path.join(dir, 'plant.db');
  const hadData = fs.existsSync(path.join(root, 'data'));
  plantCopy(copy);
  const before = createHash('sha256').update(fs.readFileSync(copy)).digest('hex');
  const modelOut = path.join(dir, 'model.json');
  const ran = runScript(['--db', copy, '--model-out', modelOut]);
  assert.equal(ran.code, 0, ran.stderr);
  const report = JSON.parse(ran.stdout);
  assert.equal(report.validated, false);
  assert.equal(report.fit.validated, false);
  assert.equal(report.fit.ok, true);
  assert.equal(report.method, 'bundle-rug-mcap-v1');
  assert.equal(report.preRegistration, PRE_REGISTRATION);
  assert.equal(report.counts.labeled, 48);
  assert.ok(Math.abs(report.fit.model.coefficients.logSupplyBoughtPct - 0.35) < 1e-5, JSON.stringify(report.fit.model.coefficients));
  assert.ok(Math.abs(report.fit.model.coefficients.logWalletCount - 0.1) < 1e-5);
  assert.ok(Math.abs(report.fit.model.coefficients.sizeCv + 0.2) < 1e-5);
  assert.ok(report.fit.split.trainEnd < report.fit.split.testStart);
  assert.equal(createHash('sha256').update(fs.readFileSync(copy)).digest('hex'), before);
  const loaded = loadModelFile(modelOut);
  assert.equal(loaded.id, report.fit.model.id);
  assert.equal(loaded.method, 'bundle-rug-mcap-v1');
  if (!hadData) assert.equal(fs.existsSync(path.join(root, 'data')), false);
  const refused = runScript(['--db', '/opt/curvewatch/data/curvewatch.db']);
  assert.equal(refused.code, 2);
  const refusedOut = runScript(['--db', copy, '--model-out', path.join(root, 'data', 'model.json')]);
  assert.equal(refusedOut.code, 2);
  assert.equal(createHash('sha256').update(fs.readFileSync(copy)).digest('hex'), before);
  const help = runScript(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /readonly/);
});

test('fingerprint files are untouched and the bundle module is outside the hash list', () => {
  const files = ['src/engine/score.js', 'src/engine/token.js', 'src/engine/paper.js', 'src/engine/engine.js', 'src/engine/capitalPolicy.js'];
  execFileSync('git', ['diff', '--exit-code', 'main', '--', ...files], { cwd: root });
  const version = fs.readFileSync('src/version.js', 'utf8');
  assert.match(version, /engine\/score\.js', 'engine\/token\.js', 'engine\/paper\.js', 'engine\/engine\.js', 'engine\/capitalPolicy\.js'/);
  for (const name of fs.readdirSync('src/bundle')) {
    const imports = fs.readFileSync(path.join('src/bundle', name), 'utf8').split('\n').filter((line) => line.startsWith('import '));
    assert.ok(imports.every((line) => !/engine\/|version\.js|capitalPolicy/.test(line)), name);
  }
  const server = fs.readFileSync('src/server.js', 'utf8');
  assert.ok(server.indexOf('config.dashboardPassword') < server.indexOf('registerRiskRoute(app'));
  const doc = fs.readFileSync('docs/bundle-rug-zone-v1.md', 'utf8');
  assert.match(doc, /bundle-rug-mcap-v1/);
  assert.match(doc, /at least 50/);
  assert.match(doc, /80 percent/);
  assert.match(doc, /at or below half/);
  const fpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-fp-'));
  const env = { ...process.env, DATA_DIR: fpDir, LOG_LEVEL: 'error' };
  delete env.HELIUS_API_KEY;
  delete env.TELEGRAM_BOT_TOKEN;
  delete env.BUNDLE_RUG_MODEL;
  const cfg = execFileSync(process.execPath, ['--input-type=module', '-e', "import { CFG } from './src/version.js'; console.log(CFG);"], { cwd: root, env, encoding: 'utf8' }).trim();
  assert.match(cfg, /^[0-9a-f]{8}$/);
  console.log('fingerprint', cfg);
});

function shape(body) {
  for (const key of ['contract', 'mode', 'illustrative', 'validated', 'mint', 'observedAt', 'token', 'coverage', 'rules', 'bundle', 'clusters', 'signals', 'rugZone', 'disclaimer']) {
    assert.ok(key in body, key);
  }
  for (const key of ['name', 'symbol', 'creator', 'createdAt', 'ageSec', 'quoteOk', 'mcapSol', 'mcapUsd', 'solUsd', 'progressPct', 'peakMcapSol', 'graduated', 'lite']) {
    assert.ok(key in body.token, key);
  }
  for (const key of ['sameSlot', 'sharedFunders', 'coordinatedTiming']) assert.ok(body.signals[key].status);
  assert.ok('low' in body.rugZone.mcapSol && 'high' in body.rugZone.mcapSol);
  assert.equal(body.rugZone.validated, body.validated);
}

await testAsync('endpoint matches risk.v1, requires the dashboard password, and logs one prediction', async () => {
  clearRiskCaches();
  const { default: express } = await import('express');
  const mint = '1'.repeat(32);
  const createdAt = 1_700_000_000_000;
  const wallets = [pad('A'), pad('B'), pad('D')];
  const loaded = {
    source: 'memory',
    lite: false,
    truncated: false,
    meta: { name: 'Sample', symbol: 'SAMP', creator: pad('C'), createdAt, createSlot: 10, quoteOk: true, graduated: false, mcapSol: 28.4, peakMcapSol: 30.1, progressPct: 11.2 },
    trades: wallets.map((wallet, i) => buy(wallet, 1, 24_000_000, { ts: createdAt + 100 + i, slot: 10, sig: `e${i}` })),
    holders: new Map(wallets.map((wallet) => [wallet, 24_000_000])),
    funders: null,
  };
  const logDb = new Database(':memory:');
  const token = { lite: false, recording: false };
  let recorded = 0;
  const engine = {
    getToken: () => token,
    startRecording(t) { t.recording = true; recorded += 1; },
  };
  const app = express();
  const password = 'secret';
  app.use((req, res, next) => {
    const header = req.headers.authorization || '';
    const [, b64] = header.split(' ');
    const [, pass] = Buffer.from(b64 || '', 'base64').toString().split(':');
    if (pass === password) return next();
    res.status(401).send('auth required');
  });
  registerRiskRoute(app, {
    db: logDb, engine, model: frozenModel(), now: () => createdAt + 60_000, solUsd: () => 100, load: () => loaded,
  });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/api/risk/${mint}`;
    const denied = await fetch(url);
    assert.equal(denied.status, 401);
    const auth = { authorization: `Basic ${Buffer.from(`x:${password}`).toString('base64')}` };
    const bad = await fetch(`http://127.0.0.1:${port}/api/risk/not-a-mint`, { headers: auth });
    assert.equal(bad.status, 400);
    const badBody = await bad.json();
    assert.equal(badBody.contract, 'risk.v1');
    assert.equal(badBody.error, 'invalid_mint');
    const ok = await fetch(url, { headers: auth });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.equal(ok.headers.get('access-control-allow-origin'), '*');
    const body = await ok.json();
    shape(body);
    assert.equal(body.validated, false);
    assert.equal(body.rugZone.status, 'unvalidated');
    assert.equal(body.mode, 'live');
    assert.equal(body.bundle.walletCount, 3);
    assert.equal(body.bundle.hardReject, true);
    assert.ok(Math.abs(body.bundle.supplyHeldPct - 7.2) < 1e-6);
    assert.equal(body.token.symbol, 'SAMP');
    assert.equal(MINT_RE.test(mint), true);
    const again = await fetch(url, { headers: auth });
    assert.equal(again.status, 200);
    assert.equal(recorded, 1);
    assert.equal(logDb.prepare('SELECT COUNT(*) AS n FROM bundle_risk_log').get().n, 1);
    const row = logDb.prepare('SELECT * FROM bundle_risk_log').get();
    assert.equal(row.model, frozenModel().id);
    assert.ok(row.low_sol < row.high_sol);
    const features = JSON.parse(row.features);
    assert.equal(features.wallets.length, 3);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    logDb.close();
  }
});

await testAsync('unknown mint, released mint, and a failed read use the contract errors', async () => {
  clearRiskCaches();
  const { default: express } = await import('express');
  const app = express();
  const empty = new Database(':memory:');
  empty.exec('CREATE TABLE tokens (mint TEXT PRIMARY KEY, name TEXT, symbol TEXT, creator TEXT, created_at INTEGER, create_slot INTEGER, graduated INTEGER); CREATE TABLE trades (mint TEXT, ts INTEGER, slot INTEGER, sig TEXT, wallet TEXT, is_buy INTEGER, sol REAL, tok REAL, vsol REAL, vtok REAL)');
  registerRiskRoute(app, { db: empty, engine: { getToken: () => null }, solUsd: () => null });
  const broken = express();
  registerRiskRoute(broken, { db: empty, load: () => { throw new Error('disk failed'); }, solUsd: () => null });
  const seen = express();
  registerRiskRoute(seen, {
    db: empty,
    solUsd: () => null,
    load: () => ({ lite: true, source: 'none', truncated: false, meta: { name: 'R', symbol: 'R', creator: null, createdAt: 1_000, createSlot: 2, quoteOk: true, mcapSol: 4, peakMcapSol: 5, progressPct: 1 }, trades: [], funders: null, holders: null }),
  });
  const servers = await Promise.all([app, broken, seen].map((instance) => new Promise((resolve) => {
    const listening = instance.listen(0, '127.0.0.1', () => resolve(listening));
  })));
  try {
    const missing = await fetch(`http://127.0.0.1:${servers[0].address().port}/api/risk/${'2'.repeat(32)}`);
    assert.equal(missing.status, 404);
    const missingBody = await missing.json();
    assert.equal(missingBody.error, 'not_seen');
    assert.equal(missingBody.contract, 'risk.v1');
    const failed = await fetch(`http://127.0.0.1:${servers[1].address().port}/api/risk/${'3'.repeat(32)}`);
    assert.equal(failed.status, 503);
    const failedBody = await failed.json();
    assert.equal(failedBody.error, 'unavailable');
    assert.equal(failedBody.message, 'The process cannot read its database.');
    assert.equal(failedBody.message.includes('disk'), false);
    const released = await fetch(`http://127.0.0.1:${servers[2].address().port}/api/risk/${'4'.repeat(32)}`);
    const releasedBody = await released.json();
    assert.equal(released.status, 200);
    assert.equal(releasedBody.coverage.detail, 'released');
    assert.equal(releasedBody.bundle.supplyHeldPct, null);
    assert.equal(releasedBody.validated, false);
  } finally {
    await Promise.all(servers.map((instance) => new Promise((resolve) => instance.close(resolve))));
    empty.close();
  }
});

console.log(`${n} bundle risk tests passed`);
