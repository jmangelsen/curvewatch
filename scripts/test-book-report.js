// Cohort-separated paper stats. Two fingerprints must not be averaged together.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { ci99Low, formatReport, reportBooks } from './book-report.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-books-'));
const dbPath = path.join(dir, 'copy.db');
const db = new Database(dbPath);
db.exec(`CREATE TABLE paper_trades (
    id INTEGER PRIMARY KEY, mint TEXT, symbol TEXT, status TEXT, book TEXT, cfg TEXT,
    pnl_pct REAL, pnl_sol REAL, gap INTEGER, gated INTEGER, exit_ts INTEGER
  );
  CREATE TABLE grad_paper (
    id INTEGER PRIMARY KEY, mint TEXT, symbol TEXT, status TEXT, book TEXT, cfg TEXT,
    pnl_pct REAL, pnl_sol REAL, exit_ts INTEGER
  );`);
const put = db.prepare(`INSERT INTO paper_trades (mint, symbol, status, book, cfg, pnl_pct, pnl_sol, gap, gated, exit_ts) VALUES (?,?,?,?,?,?,?,?,?,?)`);
put.run('a1', 'A', 'closed', 'main', 'aaaa1111', 10, 0.02, 0, 0, 1);
put.run('a2', 'A', 'closed', 'main', 'aaaa1111', 30, 0.06, 0, 0, 2);
put.run('a3', 'A', 'closed', 'main', 'aaaa1111', -100, -0.2, 1, 0, 3);
put.run('a4', 'A', 'open', 'main', 'aaaa1111', null, null, 0, 0, null);
put.run('b1', 'B', 'closed', 'main', 'bbbb2222', -40, -0.08, 0, 0, 4);
put.run('r1', 'R', 'closed', 'runnerA', 'aaaa1111', 5, 0.01, 0, 0, 5);
put.run('c1', 'C', 'closed', 'runnerActl', 'aaaa1111', -5, -0.01, 0, 0, 6);
const gput = db.prepare(`INSERT INTO grad_paper (mint, symbol, status, book, cfg, pnl_pct, pnl_sol, exit_ts) VALUES (?,?,?,?,?,?,?,?)`);
gput.run('h1', 'H', 'closed', 'holderB', 'aaaa1111', 12, 0.02, 7);
gput.run('h2', 'H', 'closed', 'holderB', 'aaaa1111', 18, 0.03, 8);
gput.run('k1', 'K', 'open', 'holderBctl', 'aaaa1111', null, null, null);
gput.run('k2', 'K', 'closed', 'holderBctl', 'bbbb2222', -10, -0.02, 9);
db.close();

const database = new Database(dbPath, { readonly: true });
const report = reportBooks(database);
database.close();
assert.equal(report.provisional, true);
assert.equal(report.cohorts.length, 2);
const a = report.cohorts.find((c) => c.cfg === 'aaaa1111');
const b = report.cohorts.find((c) => c.cfg === 'bbbb2222');
const mainA = a.books.find((x) => x.book === 'main');
const mainB = b.books.find((x) => x.book === 'main');
assert.equal(mainA.closed, 2);
assert.equal(mainA.open, 1);
assert.equal(mainA.excluded, 1);
assert.equal(mainA.meanPct, 20);
assert.equal(mainA.medianPct, 20);
assert.equal(mainA.winRate, 1);
assert.ok(Math.abs(mainA.ci99LowPct - ci99Low([10, 30])) < 1e-9);
assert.ok(Math.abs(mainA.ci99LowPct - (20 - 2.576 * 10)) < 1e-9);
assert.equal(mainB.closed, 1);
assert.equal(mainB.meanPct, -40);
assert.equal(mainB.ci99LowPct, null);
assert.equal(a.books.find((x) => x.book === 'runnerA').closed, 1);
assert.equal(a.books.find((x) => x.book === 'runnerActl').meanPct, -5);
assert.equal(a.books.find((x) => x.book === 'holderB').table, 'grad_paper');
assert.equal(a.books.find((x) => x.book === 'holderB').meanPct, 15);
assert.equal(a.books.find((x) => x.book === 'holderBctl').open, 1);
assert.equal(a.books.find((x) => x.book === 'holderBctl').closed, 0);
assert.equal(b.books.find((x) => x.book === 'holderBctl').meanPct, -10);
assert.equal(b.books.find((x) => x.book === 'holderB').closed, 0);
const text = formatReport(report);
assert.match(text, /cohort aaaa1111/);
assert.match(text, /cohort bbbb2222/);
assert.doesNotMatch(text, /cohort pooled|all cohorts/i);
const one = reportBooks(new Database(dbPath, { readonly: true }), { cfg: 'bbbb2222' });
assert.equal(one.cohorts.length, 1);
assert.equal(one.cohorts[0].books.find((x) => x.book === 'main').closed, 1);

const root = path.resolve(new URL('..', import.meta.url).pathname);
const cli = spawnSync(process.execPath, [path.join(root, 'scripts/book-report.js'), '--db', dbPath, '--cfg', 'aaaa1111'], { encoding: 'utf8' });
assert.equal(cli.status, 0, cli.stderr || cli.stdout);
assert.match(cli.stdout, /cohort aaaa1111/);
assert.doesNotMatch(cli.stdout, /bbbb2222/);
const refused = spawnSync(process.execPath, [path.join(root, 'scripts/book-report.js'), '--db', '/opt/curvewatch/data/curvewatch.db'], { encoding: 'utf8' });
assert.equal(refused.status, 2);
assert.match(refused.stderr, /refusing production path/);

fs.rmSync(dir, { recursive: true, force: true });
console.log('ok book report cohorts stay separate');
console.log('1 book-report tests passed');
