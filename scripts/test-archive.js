// Retention archives rows before deleting them; the gzip CSV round-trips (multi-member gzip, header once per file).
import assert from 'node:assert/strict';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs'; import zlib from 'node:zlib';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cwar-'));
const { db, archiveBefore } = await import('../src/db.js');
const ins = db.prepare('INSERT INTO trades (mint, ts, slot, sig, wallet, is_buy, sol, tok, vsol, vtok) VALUES (?,?,?,?,?,?,?,?,?,?)');
const t0 = Date.UTC(2026, 8, 15), cut = Date.UTC(2026, 9, 1);
for (let i = 0; i < 5; i++) ins.run('Mint' + i, t0 + i * 86400000 * 5, 1, 'sig,with"quote', 'w', i % 2, 1.5, 2, 3, 4); // Sep 15/20/25/30, Oct 5
const n1 = archiveBefore('trades', 'ts', cut); const n2 = archiveBefore('trades', 'ts', cut + 86400000 * 20);
const dir = path.join(process.env.DATA_DIR, 'archive');
const read = (f) => zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString().trim().split('\n');
const sep = read('trades-2026-09.csv.gz'), oct = read('trades-2026-10.csv.gz');
assert.equal(n1, 4); assert.equal(n2, 5); // second call re-archives everything before its cutoff (dedupe is by DELETE following in retention)
assert.equal(sep[0], 'mint,ts,slot,sig,wallet,is_buy,sol,tok,vsol,vtok'); assert.equal(sep.filter((l) => l.startsWith('mint,')).length, 1, 'header once');
assert.ok(sep[1].includes('"sig,with""quote"'), 'csv quoting'); assert.equal(oct.filter((l) => l.startsWith('Mint')).length, 1, 'one October row'); assert.equal(sep.filter((l) => l.startsWith('Mint')).length, 8, 'second append readable as one stream');
console.log('ok archive: rows exported per month, header once, quoting, multi-member gzip readable');
console.log('1 archive tests passed');
