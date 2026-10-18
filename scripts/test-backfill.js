// Gap backfill: mint extraction from a migration transaction, window filtering of signatures, and the run loop with a mocked RPC.
import assert from 'node:assert/strict';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cwbf-')); process.env.BACKFILL_PACE_MS = '1'; process.env.BACKFILL_MIN_GAP_SEC = '1';
const { Graduates } = await import('../src/engine/graduates.js');
const { mintFromTx, migrationSignatures, backfillGap, backfillState } = await import('../src/engine/backfill.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const MINT = 'HFTeht7ZjgtnCxAPEJ1is7bmRNnTCSv56WdgZazkpump';
const tx = (keys, loaded = {}) => ({ transaction: { message: { accountKeys: keys } }, meta: { loadedAddresses: loaded } });

t('mint is the single pump-suffixed key, including lookup-table addresses; ambiguous or absent is null', () => {
  assert.equal(mintFromTx(tx(['39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg', MINT, 'So11111111111111111111111111111111111111112'])), MINT);
  assert.equal(mintFromTx(tx(['abc'], { writable: [MINT] })), MINT);
  assert.equal(mintFromTx(tx(['abc'])), null);
  assert.equal(mintFromTx(tx([MINT, 'otherpump'])), null);
  assert.equal(mintFromTx(null), null);
});

// mocked RPC: 3 migrations, one inside the window, one too new, one too old; plus one failed tx
const now = Date.now(), S = (sig, sec, err = null) => ({ signature: sig, blockTime: Math.floor((now - sec * 1000) / 1000), err });
const sigs = [S('new', 10), S('in1', 120), S('in2', 200), S('bad', 150, { x: 1 }), S('old', 10000)];
const txs = { in1: tx([MINT]), in2: tx(['nothing-here']), new: tx(['Xpump']), old: tx(['Ypump']) };
globalThis.fetch = async (url, o) => { const b = JSON.parse(o.body); let result = null;
  if (b.method === 'getSignaturesForAddress') result = b.params[1].before ? [] : sigs;
  if (b.method === 'getTransaction') result = txs[b.params[0]] || null;
  return { status: 200, json: async () => ({ result }) }; };

const found = await migrationSignatures(now - 300000, now - 60000);
t('signature window keeps in-range successful migrations only, newest first', () => { assert.deepEqual(found.map((x) => x.sig), ['in1', 'in2']); });

const grads = new Graduates();
await backfillGap(now - 300000, now - 60000, { grads, reason: 'test' });
t('run adds the recoverable mint to the graduates watch as backfill with the migration time, counts the unreadable one', () => {
  const st = grads.watch.get(MINT); assert.ok(st, 'added'); assert.equal(st.source, 'backfill'); assert.equal(st.pairCreatedAt, found[0].ts);
  assert.equal(backfillState.lastRun.added, 1); assert.equal(backfillState.lastRun.failed, 1); assert.equal(backfillState.lastRun.migrations, 2);
});
await backfillGap(now - 300000, now - 60000, { grads, reason: 'test2' });
t('a second pass over the same window adds nothing (already watched)', () => { assert.equal(backfillState.lastRun.added, 0); assert.equal(backfillState.lastRun.known, 1); });
console.log(`${n} backfill tests passed`);
