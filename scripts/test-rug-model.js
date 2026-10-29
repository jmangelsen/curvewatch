// Provisional rug model: fixture labels only. Does not read a production database.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-rug-'));
const dbPath = path.join(dir, 'copy.db');
const winners = path.join(dir, 'winners.csv');
const rugs = path.join(dir, 'rug-cases.csv');
const db = new Database(dbPath);
db.exec(`CREATE TABLE tokens (mint TEXT PRIMARY KEY, symbol TEXT, name TEXT, creator TEXT, created_at INTEGER, graduated INTEGER, graduated_at INTEGER, peak_mcap_1h REAL, mcap_1h REAL, rugged INTEGER);
  CREATE TABLE holder_history (mint TEXT, ts INTEGER, holders INTEGER, top10_pct REAL, PRIMARY KEY (mint, ts));
  CREATE TABLE bundle_funders (wallet TEXT, funder TEXT);
  CREATE TABLE trades (mint TEXT, ts INTEGER, wallet TEXT);
  CREATE TABLE grad_watch (mint TEXT PRIMARY KEY, curve_bundle_pct REAL, curve_creator_hold_pct REAL);`);
const early = 'EARLY'.padEnd(44, 'e');
const late = 'LATE'.padEnd(44, 'l');
db.prepare(`INSERT INTO tokens (mint, symbol, created_at, graduated, graduated_at) VALUES (?,?,?,?,?)`).run(early, 'EARLY', 1_000_000, 1, 1_000_000 + 8 * 60_000);
db.prepare(`INSERT INTO holder_history (mint, ts, holders) VALUES (?,?,?)`).run(early, 1_000_000, 10);
db.prepare(`INSERT INTO holder_history (mint, ts, holders) VALUES (?,?,?)`).run(early, 1_000_000 + 3600_000, 40);
db.prepare(`INSERT INTO bundle_funders (wallet, funder) VALUES (?,?)`).run('w1', 'parent');
db.prepare(`INSERT INTO bundle_funders (wallet, funder) VALUES (?,?)`).run('w2', 'parent');
db.prepare(`INSERT INTO trades (mint, ts, wallet) VALUES (?,?,?)`).run(early, 1_000_000 + 1000, 'w1');
db.prepare(`INSERT INTO trades (mint, ts, wallet) VALUES (?,?,?)`).run(early, 1_000_000 + 2000, 'w2');
db.prepare(`INSERT INTO grad_watch (mint, curve_creator_hold_pct) VALUES (?,?)`).run(early, 1.5);
db.close();

const winnerRows = [
  ['A', early, 'EARLY', '2026-10-01T00:00:00Z', '100', '', '', '', 'yes', 'first10s buyers 12; bundler pct 10.0%; biggest first buyer 3.0%; insiders sold to 0.0%'],
  ['B', 'LOW1'.padEnd(44, 'a'), 'LOW1', '2026-10-02T00:00:00Z', '100', '', '', '', 'yes', 'bundler pct 12.0%; insiders sold to 1.0%'],
  ['B', 'LOW2'.padEnd(44, 'b'), 'LOW2', '2026-10-03T00:00:00Z', '100', '', '', '', 'yes', 'bundler pct 8.0%; insiders now 2.0%'],
  ['A', 'BOTH'.padEnd(44, 'c'), 'BOTH', '2026-10-04T00:00:00Z', '100', '', '', '', 'yes', 'bundler pct 50%'],
];
fs.writeFileSync(winners, `track,mint,symbol,launch_utc,peak_mc,minutes_to_peak,mc_24h,mc_7d,bonded,early_signals,source_url\n${winnerRows.map((r) => r.join(',')).join('\n')}\n`);
const rugRows = [
  ['HIGH1'.padEnd(44, 'r'), 'solana', 'H1', '2026-10-05T00:00:00Z', '100', '1', '99', '80', '22', 'true'],
  ['HIGH2'.padEnd(44, 's'), 'solana', 'H2', '2026-10-06T00:00:00Z', '100', '1', '99', '75', '30', 'true'],
  ['HIGH3'.padEnd(44, 't'), 'solana', 'H3', '2026-10-07T00:00:00Z', '100', '1', '99', '90', '10', 'true'],
  ['BOTH'.padEnd(44, 'c'), 'solana', 'BOTH', '2026-10-04T00:00:00Z', '100', '1', '99', '50', '10', ''],
  ['0xabc', 'robinhood', 'OTHER', '2026-10-08T00:00:00Z', '100', '1', '90', '', '', ''],
];
fs.writeFileSync(rugs, `mint,chain,ticker,first_seen_utc,peak_cap,latest_cap,drawdown_pct,bundler_pct,top10_pct,dev_sold,source_url\n${rugRows.map((r) => r.join(',')).join('\n')}\n`);

const before = createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex');
const { buildReport } = await import('./rug-model.js');
const { dedupe, joinOne, rowsOf } = await import('./join-labels.js');
const database = new Database(dbPath, { readonly: true });
const labels = dedupe([winners, rugs].flatMap((file) => rowsOf(file)));
const joined = labels.map((label) => joinOne(database, label));
const report = buildReport(database, joined);
database.close();
assert.equal(createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex'), before);
assert.equal(report.provisional, true);
assert.match(report.disclaimer, /Not a kill-rule PASS/);
assert.equal(report.n.conflicts, 1);
assert.equal(report.n.excludedChain, 1);
assert.ok(report.n.winners >= 3 && report.n.rugs >= 3);
const snipe = report.features.find((f) => f.name === 'snipeConcentration');
assert.ok(snipe.nWinner >= 3 && snipe.nRug >= 3);
assert.ok(snipe.diffRugMinusWinner > 0, JSON.stringify(snipe));
const earlyRow = report.rows.find((r) => r.mint === early);
assert.equal(earlyRow.class, 'winner');
assert.equal(earlyRow.matched, true);
assert.ok(Math.abs(earlyRow.features.timeToBondMin - 8) < 1e-6);
assert.ok(Math.abs(earlyRow.features.holderVelocity - 30) < 1e-6, String(earlyRow.features.holderVelocity));
assert.equal(earlyRow.features.bundleFunderOverlap, 1);
assert.equal(earlyRow.features.devHoldings, 1.5);
assert.equal(report.rows.find((r) => r.mint.startsWith('BOTH')).excluded, true);
assert.equal(report.rows.find((r) => r.mint === '0xabc').excludeReason, 'non-solana');
assert.equal(report.scorer.method, 'mean-of-univariate-logistics');
assert.ok(report.scorer.models.snipeConcentration.coef > 0);
assert.ok(report.holdout.test.n >= 1);
assert.equal(report.rows.every((r) => r.provisional === true), true);
const rugScore = report.rows.find((r) => r.symbol === 'H1').pRug;
const winScore = report.rows.find((r) => r.symbol === 'LOW1').pRug;
assert.ok(rugScore > winScore, `${rugScore} vs ${winScore}`);

const out = path.join(dir, 'report.json');
const cli = spawnSync(process.execPath, [path.join(root, 'scripts/rug-model.js'), '--db', dbPath, '--csv', winners, '--csv', rugs, '--out', out], { encoding: 'utf8' });
assert.equal(cli.status, 0, cli.stderr || cli.stdout);
assert.match(cli.stderr, /Provisional/);
assert.equal(createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex'), before);
const refused = spawnSync(process.execPath, [path.join(root, 'scripts/rug-model.js'), '--db', '/opt/curvewatch/data/curvewatch.db', '--csv', winners], { encoding: 'utf8' });
assert.equal(refused.status, 2);
assert.match(refused.stderr, /refusing production path/);
const src = fs.readFileSync(path.join(root, 'scripts/rug-model.js'), 'utf8');
assert.equal(/from '\.\.\/src\//.test(src), false);

fs.rmSync(dir, { recursive: true, force: true });
console.log('ok rug model fixture');
console.log('1 rug-model tests passed');
