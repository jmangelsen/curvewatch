import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'cw-studio-worker-'));
process.env.LOG_LEVEL='error';
await import('../src/engine/graduates.js');
const {studioCall}=await import('../src/studioWorker.js');
// Force the deadline during cold startup, not a race against a warmed cached reply.
await assert.rejects(studioCall('overview',{days:1},0),/timed out/);
console.log('ok deadline rejects and terminates the busy worker');
const first=await studioCall('overview',{days:1},10000);
assert.equal(first.tokens,0);
console.log('ok isolated Studio worker returns an empty honest dataset after timeout');
await assert.rejects(studioCall('notAnExport',{},10000),/not a function/);
const second=await studioCall('overview',{days:1},10000);
assert.equal(second.tokens,0);
console.log('ok a worker error propagates without corrupting later requests');
console.log('3 Studio worker tests passed');
