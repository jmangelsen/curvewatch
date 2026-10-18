// Runs the Studio queries on a worker thread with its own read connection, so a 5 s cohort scan never stalls the
// trade loop (a blocked event loop would delay paper fills and skew the very data being studied).
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

if (!isMainThread) {
  const S = await import('./studio.js');
  parentPort.on('message', ({ id, fn, args }) => {
    try { parentPort.postMessage({ id, ok: true, v: S[fn](args || {}) }); }
    catch (e) { parentPort.postMessage({ id, ok: false, err: e.message }); }
  });
} 

let worker = null, seq = 0; const waiting = new Map();
function ensure() {
  if (worker) return worker;
  worker = new Worker(fileURLToPath(import.meta.url), { env: process.env });
  worker.on('message', (m) => { const w = waiting.get(m.id); if (!w) return; waiting.delete(m.id); clearTimeout(w.t); m.ok ? w.res(m.v) : w.rej(new Error(m.err)); });
  worker.on('error', (e) => { for (const w of waiting.values()) { clearTimeout(w.t); w.rej(e); } waiting.clear(); worker = null; });
  worker.on('exit', () => { worker = null; });
  worker.unref();
  return worker;
}
/** Call a studio export off-thread: studioCall('curves', { days: 14 }). */
export function studioCall(fn, args = {}, timeoutMs = 60000) {
  return new Promise((res, rej) => {
    const id = ++seq; const w = ensure();
    const t = setTimeout(() => { waiting.delete(id); rej(new Error('studio timed out')); }, timeoutMs);
    waiting.set(id, { res, rej, t });
    w.postMessage({ id, fn, args });
  });
}
