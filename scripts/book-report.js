// Read-only paper-book report for one database copy.
// Prints main, runnerA, and runnerActl from paper_trades, and holderB / holderBctl from grad_paper.
// Each fingerprint cohort is its own section. Cohorts are never added together.
// Does not import config (that would read .env and create DATA_DIR) and does not write.
//
//   node scripts/book-report.js --db /path/to/copy.db [--cfg ac00c1e9]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

// Same z as paper.js zFor(0.99): the 99% lower bound of the mean.
const Z99 = 2.576;
export const BOOKS = [
  { book: 'main', table: 'paper_trades' },
  { book: 'runnerA', table: 'paper_trades' },
  { book: 'runnerActl', table: 'paper_trades' },
  { book: 'holderB', table: 'grad_paper' },
  { book: 'holderBctl', table: 'grad_paper' },
];

function args(argv) {
  const o = { db: null, cfg: undefined, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--db') o.db = argv[++i];
    else if (a === '--cfg') o.cfg = argv[++i];
    else { console.error(`unknown argument ${a}`); process.exit(2); }
  }
  return o;
}

function assertCopy(p) {
  const resolved = path.resolve(p);
  if (resolved === '/opt/curvewatch' || resolved.startsWith('/opt/curvewatch/')) {
    console.error(`refusing production path ${resolved}`);
    process.exit(2);
  }
  return resolved;
}

function tableExists(database, name) {
  return !!database.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(name);
}

function columns(database, table) {
  if (!tableExists(database, table)) return new Set();
  return new Set(database.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
}

function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  const mid = n >> 1;
  return n % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 99% lower bound of the mean, in the same units as the input. Null below n=2. */
export function ci99Low(values) {
  const xs = values.filter((v) => v != null && Number.isFinite(v));
  if (xs.length < 2) return null;
  const m = mean(xs);
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
  return m - Z99 * sd / Math.sqrt(xs.length);
}

function cohortKeys(database) {
  const keys = new Set();
  for (const table of ['paper_trades', 'grad_paper']) {
    const cols = columns(database, table);
    if (!cols.has('book')) continue;
    const cfgs = cols.has('cfg')
      ? database.prepare(`SELECT DISTINCT cfg FROM ${table}`).all().map((r) => r.cfg ?? null)
      : [null];
    for (const c of cfgs) keys.add(c);
  }
  return [...keys].sort((a, b) => String(a ?? '').localeCompare(String(b ?? '')));
}

function whereCfg(cols, cfg, params) {
  if (!cols.has('cfg')) return '';
  if (cfg == null) return ` AND cfg IS NULL`;
  params.push(cfg);
  return ` AND cfg=?`;
}

function bookStats(database, spec, cfg) {
  const cols = columns(database, spec.table);
  const empty = { book: spec.book, table: spec.table, cohort: cfg, closed: 0, open: 0, excluded: 0, winRate: null, meanPct: null, medianPct: null, ci99LowPct: null };
  if (!cols.has('book') || !cols.has('pnl_pct')) return empty;
  const closedParams = [spec.book];
  let closedSql = `SELECT pnl_pct FROM ${spec.table} WHERE status='closed' AND COALESCE(book,'main')=?${whereCfg(cols, cfg, closedParams)}`;
  if (cols.has('gap')) closedSql += ` AND COALESCE(gap,0)=0`;
  if (cols.has('gated')) closedSql += ` AND COALESCE(gated,0)=0`;
  const pnls = database.prepare(closedSql).all(...closedParams).map((r) => r.pnl_pct).filter((v) => v != null && Number.isFinite(v));
  const openParams = [spec.book];
  const openSql = `SELECT COUNT(*) n FROM ${spec.table} WHERE status='open' AND COALESCE(book,'main')=?${whereCfg(cols, cfg, openParams)}`;
  const open = database.prepare(openSql).get(...openParams).n;
  let excluded = 0;
  if (cols.has('gap') || cols.has('gated')) {
    const bits = [];
    if (cols.has('gap')) bits.push(`COALESCE(gap,0)=1`);
    if (cols.has('gated')) bits.push(`COALESCE(gated,0)=1`);
    const exParams = [spec.book];
    excluded = database.prepare(`SELECT COUNT(*) n FROM ${spec.table} WHERE status='closed' AND COALESCE(book,'main')=?${whereCfg(cols, cfg, exParams)} AND (${bits.join(' OR ')})`).get(...exParams).n;
  }
  const n = pnls.length;
  return {
    book: spec.book,
    table: spec.table,
    cohort: cfg,
    closed: n,
    open,
    excluded,
    winRate: n ? pnls.filter((v) => v > 0).length / n : null,
    meanPct: n ? mean(pnls) : null,
    medianPct: n ? median(pnls) : null,
    ci99LowPct: ci99Low(pnls),
  };
}

export function reportBooks(database, { cfg = undefined } = {}) {
  const present = cohortKeys(database);
  const cohorts = cfg === undefined ? present : present.filter((c) => c === cfg);
  return {
    provisional: true,
    disclaimer: 'Descriptive counts for one fingerprint at a time. Cohorts are not pooled. This is not a kill-rule PASS.',
    z99: Z99,
    cohorts: cohorts.map((c) => ({
      cfg: c,
      books: BOOKS.map((spec) => bookStats(database, spec, c)),
    })),
  };
}

function fmt(v, digits, suffix = '') {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  return `${v.toFixed(digits)}${suffix}`;
}

export function formatReport(report) {
  const lines = [report.disclaimer, ''];
  if (!report.cohorts.length) lines.push('no paper rows');
  for (const cohort of report.cohorts) {
    lines.push(`cohort ${cohort.cfg == null ? '(none)' : cohort.cfg}`);
    lines.push('book         venue          closed  open  excluded  win%     mean%      median%    ci99lo%');
    for (const b of cohort.books) {
      const cells = [
        b.book.padEnd(12),
        b.table.padEnd(14),
        String(b.closed).padStart(6),
        String(b.open).padStart(5),
        String(b.excluded).padStart(9),
        fmt(b.winRate == null ? null : b.winRate * 100, 1).padStart(8),
        fmt(b.meanPct, 2).padStart(10),
        fmt(b.medianPct, 2).padStart(10),
        fmt(b.ci99LowPct, 2).padStart(10),
      ];
      lines.push(cells.join(' '));
    }
    lines.push('');
  }
  return lines.join('\n').replace(/\n+$/, '\n');
}

export function main(argv = process.argv) {
  const o = args(argv);
  if (o.help || !o.db) {
    console.log(`book-report — read-only per-cohort paper stats. Cohorts are not pooled.

  node scripts/book-report.js --db <copy.db> [--cfg <fingerprint>]

main, runnerA, runnerActl are read from paper_trades. holderB and holderBctl are read from grad_paper.
Closed rows with gap=1 or gated=1 are counted as excluded and left out of the mean. The 99% lower bound uses z=2.576.`);
    process.exit(o.help ? 0 : 2);
  }
  const dbPath = assertCopy(o.db);
  if (!fs.existsSync(dbPath)) { console.error(`no such database ${dbPath}`); process.exit(2); }
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  const report = reportBooks(database, { cfg: o.cfg });
  database.close();
  process.stdout.write(formatReport(report));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
