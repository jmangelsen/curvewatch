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
function rejectWorker(w, error) {
  for (const [id,item] of waiting) if(item.worker===w) {
    clearTimeout(item.t); item.rej(error); waiting.delete(id);
  }
  if(worker===w) worker=null;
}
function ensure() {
  if (worker) return worker;
  const current = new Worker(fileURLToPath(import.meta.url), {
    env: process.env, resourceLimits:{maxOldGenerationSizeMb:384},
    execArgv: process.execArgv.filter(x=>!x.startsWith('--max-old-space-size')&&!x.startsWith('--input-type')),
  });
  worker=current;
  current.on('message', (m) => { const w = waiting.get(m.id); if (!w||w.worker!==current) return; waiting.delete(m.id); clearTimeout(w.t); m.ok ? w.res(m.v) : w.rej(new Error(m.err)); });
  current.on('error', e=>rejectWorker(current,e));
  current.on('exit', ()=>rejectWorker(current,new Error('Studio worker exited; retry a smaller date window.')));
  current.unref();
  return current;
}
/** Call a studio export off-thread: studioCall('curves', { days: 14 }). */
export function studioCall(fn, args = {}, timeoutMs = 60000) {
  return new Promise((res, rej) => {
    const id = ++seq; const w = ensure();
    const t = setTimeout(() => {
      rejectWorker(w,new Error('Studio timed out; retry a smaller date window.'));
      w.terminate();
    }, timeoutMs);
    waiting.set(id, { res, rej, t, worker:w });
    try {w.postMessage({ id, fn, args });}
    catch(e) {rejectWorker(w,e);}
  });
}
