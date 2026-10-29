// Join an external label CSV onto a Curvewatch DB *copy*. Read-only.
// Never imports the scorer, the paper engine, or config (config would create DATA_DIR).
// Never writes. Refuses /opt/curvewatch. Closed paper rows are not updated.
//
// Accepted sheets (header detects the shape; several --csv files are allowed):
//   canonical: mint,chain,label,label_time,peak_mc,peak_time,bond_time,mc_24h,source_url,notes
//   Researchy winners.csv: track,mint,symbol,launch_utc,peak_mc,minutes_to_peak,mc_24h,mc_7d,bonded,early_signals,source_url
//   rug-cases.csv: a mint column plus any of the fields above. Label defaults to rug from the file name.
// Rows are deduplicated by mint. The same mint in a winner file and a rug file is one row with conflict=true.
//
//   node scripts/join-labels.js --db /path/to/curvewatch-copy.db --csv labels.csv [--csv rug-cases.csv] [--out joined.json]
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const CANONICAL = ['mint', 'chain', 'label', 'label_time', 'peak_mc', 'peak_time', 'bond_time', 'mc_24h', 'source_url', 'notes'];
const WINNERS = ['track', 'mint', 'symbol', 'launch_utc', 'peak_mc', 'minutes_to_peak', 'mc_24h', 'mc_7d', 'bonded', 'early_signals', 'source_url'];

function args(argv) {
  const o = { db: null, csv: [], out: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--db') o.db = argv[++i];
    else if (a === '--csv') o.csv.push(argv[++i]);
    else if (a === '--out') o.out = argv[++i];
    else { console.error(`unknown argument ${a}`); process.exit(2); }
  }
  return o;
}

function usage() {
  console.log(`join-labels — read-only join of a label CSV onto a DB copy by mint.

  node scripts/join-labels.js --db <copy.db> --csv <winners.csv> [--csv <rug-cases.csv>] [--out joined.json]

The database is opened readonly. Pass a copy, never the live file.
/opt/curvewatch is refused. This script does not import scoring and does not write.`);
}

export function assertCopy(p) {
  const resolved = path.resolve(p);
  if (resolved === '/opt/curvewatch' || resolved.startsWith('/opt/curvewatch/')) {
    console.error(`refusing production path ${resolved}`);
    process.exit(2);
  }
  return resolved;
}

export function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

function tableExists(database, name) {
  return !!database.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(name);
}

function latestSignals(database, mint) {
  if (!tableExists(database, 'winner_signals')) return [];
  return database.prepare(`SELECT kind, ts, payload FROM winner_signals WHERE mint=? ORDER BY ts`).all(mint).map((r) => {
    let payload = null; try { payload = JSON.parse(r.payload); } catch { payload = null; }
    return { kind: r.kind, ts: r.ts, payload };
  });
}

function survival(database, mint) {
  if (!tableExists(database, 'survival_labels')) return [];
  return database.prepare(`SELECT horizon_h, ts, alive, mcap, ref_mcap, source FROM survival_labels WHERE mint=? ORDER BY horizon_h`).all(mint);
}

const hasAll = (header, cols) => cols.every((c) => header.includes(c));

function extrasFor(header, idx, r) {
  const used = new Set(['mint', 'chain', 'label', 'label_time', 'peak_mc', 'peak_time', 'bond_time', 'mc_24h', 'mc_7d', 'bonded', 'source_url', 'notes', 'symbol', 'ticker', 'track', 'launch_utc', 'first_seen_utc', 'minutes_to_peak', 'early_signals', 'reason', 'rug_time']);
  const extra = {};
  for (const h of header) {
    if (used.has(h)) continue;
    const v = idx[h] == null ? '' : (r[idx[h]] ?? '');
    if (v !== '') extra[h] = v;
  }
  return extra;
}

export function rowsOf(file) {
  if (!fs.existsSync(file)) { console.error(`no such csv ${file}`); process.exit(2); }
  const grid = parseCsv(fs.readFileSync(file, 'utf8'));
  if (!grid.length) { console.error(`csv is empty ${file}`); process.exit(2); }
  const header = grid[0].map((h) => h.trim());
  if (!header.includes('mint')) { console.error(`csv missing column mint (${file})`); process.exit(2); }
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const get = (r, c) => (idx[c] == null ? '' : (r[idx[c]] ?? ''));
  const winners = hasAll(header, WINNERS);
  const canonical = hasAll(header, CANONICAL);
  const rugFile = /rug/i.test(path.basename(file));
  return grid.slice(1).map((r) => {
    if (winners) {
      const launch = get(r, 'launch_utc');
      const mins = Number(get(r, 'minutes_to_peak'));
      const t0 = Date.parse(launch);
      const peak_time = Number.isFinite(t0) && Number.isFinite(mins) ? new Date(t0 + mins * 60_000).toISOString() : '';
      return {
        mint: get(r, 'mint').trim(), chain: 'solana', label: get(r, 'track') || 'winner', symbol: get(r, 'symbol'),
        label_time: launch, peak_mc: get(r, 'peak_mc'), peak_time, bond_time: '', mc_24h: get(r, 'mc_24h'),
        mc_7d: get(r, 'mc_7d'), bonded: get(r, 'bonded'), source_url: get(r, 'source_url'), notes: get(r, 'early_signals'), extras: extrasFor(header, idx, r), _file: path.basename(file),
      };
    }
    if (canonical) return { ...Object.fromEntries(CANONICAL.map((c) => [c, get(r, c)])), mint: get(r, 'mint').trim(), extras: extrasFor(header, idx, r), _file: path.basename(file) };
    return {
      mint: get(r, 'mint').trim(), chain: get(r, 'chain') || 'solana',
      label: get(r, 'label') || get(r, 'track') || (rugFile ? 'rug' : ''),
      symbol: get(r, 'symbol') || get(r, 'ticker'), label_time: get(r, 'label_time') || get(r, 'launch_utc') || get(r, 'first_seen_utc') || get(r, 'rug_time') || '',
      peak_mc: get(r, 'peak_mc'), peak_time: get(r, 'peak_time'), bond_time: get(r, 'bond_time'),
      mc_24h: get(r, 'mc_24h'), mc_7d: get(r, 'mc_7d'), bonded: get(r, 'bonded'),
      source_url: get(r, 'source_url'), notes: get(r, 'notes') || get(r, 'early_signals') || get(r, 'reason') || '',
      extras: extrasFor(header, idx, r), _file: path.basename(file),
    };
  }).filter((r) => r.mint);
}

export function dedupe(rows) {
  const by = new Map();
  for (const row of rows) {
    const { _file, extras, ...rest } = row;
    const prev = by.get(rest.mint);
    if (!prev) { by.set(rest.mint, { ...rest, extras: { ...(extras || {}) }, sourceFiles: [_file] }); continue; }
    prev.sourceFiles.push(_file);
    prev.extras = { ...(extras || {}), ...(prev.extras || {}) };
    const labels = [...new Set([prev.label, rest.label].filter(Boolean))];
    prev.label = labels.join('+');
    if (labels.length > 1) prev.conflict = true;
    for (const [k, v] of Object.entries(rest)) if ((prev[k] == null || prev[k] === '') && v) prev[k] = v;
  }
  return [...by.values()];
}

export function joinOne(database, label) {
  const mint = label.mint;
  const out = { ...label, matched: false, token: null, survival: survival(database, mint), signals: latestSignals(database, mint) };
  if (tableExists(database, 'tokens')) {
    const t = database.prepare(`SELECT mint, symbol, name, creator, created_at, graduated, graduated_at, peak_mcap_1h, mcap_1h, rugged FROM tokens WHERE mint=?`).get(mint);
    if (t) { out.matched = true; out.token = t; }
  }
  if (tableExists(database, 'grad_watch')) {
    const cols = new Set(database.prepare(`PRAGMA table_info(grad_watch)`).all().map((c) => c.name));
    const want = ['symbol', 'pair_created_at', 'mig_mcap', 'peak_price', 'active', 'dropped_reason', 'curve_bundle_pct', 'curve_creator_hold_pct', 'curve_flags'].filter((c) => cols.has(c));
    if (want.length) {
      const g = database.prepare(`SELECT ${want.join(', ')} FROM grad_watch WHERE mint=?`).get(mint);
      if (g) { out.matched = true; out.graduate = g; }
    }
  }
  if (tableExists(database, 'snapshots')) {
    const s = database.prepare(`SELECT COUNT(*) n, MAX(mcap) peak FROM snapshots WHERE mint=?`).get(mint);
    out.snapshots = s;
    if (s?.n) out.matched = true;
  }
  if (tableExists(database, 'grad_snapshots')) {
    const s = database.prepare(`SELECT COUNT(*) n, MAX(mcap) peak FROM grad_snapshots WHERE mint=?`).get(mint);
    out.gradSnapshots = s;
    if (s?.n) out.matched = true;
  }
  return out;
}

export function main(argv = process.argv) {
  const o = args(argv);
  if (o.help || !o.db || !o.csv.length) { usage(); process.exit(o.help ? 0 : 2); }
  const dbPath = assertCopy(o.db);
  if (!fs.existsSync(dbPath)) { console.error(`no such database ${dbPath}`); process.exit(2); }
  const labels = dedupe(o.csv.flatMap((file) => rowsOf(file)));
  const dupes = labels.filter((r) => r.sourceFiles.length > 1).length;
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  const closed = tableExists(database, 'paper_trades')
    ? database.prepare(`SELECT COUNT(*) n FROM paper_trades WHERE status='closed'`).get()
    : { n: null };
  const items = labels.map((label) => joinOne(database, label));
  database.close();
  const report = {
    readonly: true,
    db: dbPath,
    rows: items.length,
    matched: items.filter((r) => r.matched).length,
    unmatched: items.filter((r) => !r.matched).length,
    duplicateMints: dupes,
    closedPaperRowsRead: closed.n,
    items,
  };
  const text = JSON.stringify(report, null, 2);
  if (o.out) fs.writeFileSync(o.out, text);
  else process.stdout.write(text + '\n');
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
