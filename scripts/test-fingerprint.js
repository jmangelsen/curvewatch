// Fingerprint covers cost math, smart-wallet rule, strong, market gate, and strategy settings.
// Importing version.js must not create a database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-fp-bare-'));
const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
  import fs from 'node:fs';
  await import('./src/version.js');
  if (fs.existsSync(process.env.DATA_DIR + '/curvewatch.db')) process.exit(2);
  console.log('no-db');
`], { cwd: root, env: { ...process.env, DATA_DIR: bare, HELIUS_API_KEY: '', TELEGRAM_BOT_TOKEN: '' }, encoding: 'utf8' });
assert.equal(child.status, 0, child.stderr || child.stdout);
assert.match(child.stdout, /no-db/);
assert.equal(fs.existsSync(path.join(bare, 'curvewatch.db')), false);
fs.rmSync(bare, { recursive: true, force: true });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-fp-'));
process.env.DATA_DIR = dir;
process.env.LOG_LEVEL = 'error';
const { db, q } = await import('../src/db.js');
const { CFG, FINGERPRINT_FILES, fingerprintSettings, recordCohortStart, cfgHistory } = await import('../src/version.js');
const paper = await import('../src/engine/paper.js');

assert.equal(db.prepare(`SELECT COUNT(*) c FROM kv WHERE k LIKE 'cfg_since:%' OR k LIKE 'book_since:%'`).get().c, 0);
for (const f of ['util.js', 'engine/intel.js', 'engine/strong.js', 'engine/marketgate.js', 'engine/unpriced.js']) {
  assert.ok(FINGERPRINT_FILES.includes(f), f);
}
const settings = fingerprintSettings();
for (const k of ['smartWallets', 'marketGate', 'strong', 'strategies', 'paper']) assert.ok(settings[k], k);
assert.equal(cfgHistory().length, 0);
const since = recordCohortStart(q, db);
assert.equal(recordCohortStart(q, db), since);
assert.ok(cfgHistory().some((h) => h.cfg === CFG && h.since === since));
paper.recordBookSince(111);
paper.recordBookSince(999);
const row = db.prepare(`SELECT v FROM kv WHERE k = ?`).get(`book_since:main:${CFG}`);
assert.equal(row.v, '111');
assert.equal(CFG.length, 8);
db.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log('ok fingerprint', CFG);
console.log('1 fingerprint tests passed');
