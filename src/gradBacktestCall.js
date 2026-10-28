// One graduate backtest at a time, on a worker thread, rate-limited.
// A second thread still shares the single vCPU, so the limit is what keeps a client from queueing them.
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { allowHeavy } from './heavyLimit.js';

const WINDOW_MS = 60_000;
const TIMEOUT_MS = 90_000;
let busy = false;

export function runGradBacktestOffThread({ solUsd = 100, force = false } = {}) {
  if (busy) {
    const err = new Error('backtest already running');
    err.status = 429;
    return Promise.reject(err);
  }
  if (!allowHeavy('grads-backtest', WINDOW_MS)) {
    const err = new Error('backtest rate limit: one run per minute');
    err.status = 429;
    return Promise.reject(err);
  }
  busy = true;
  return new Promise((resolve, reject) => {
    const worker = new Worker(fileURLToPath(new URL('./engine/gradBacktestThread.js', import.meta.url)), {
      workerData: { solUsd, force },
      env: process.env,
      resourceLimits: { maxOldGenerationSizeMb: 256 },
      execArgv: process.execArgv.filter((x) => !x.startsWith('--max-old-space-size') && !x.startsWith('--input-type')),
    });
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      busy = false;
      fn(value);
      worker.terminate().catch(() => {});
    };
    const timer = setTimeout(() => finish(reject, Object.assign(new Error('backtest timed out'), { status: 504 })), TIMEOUT_MS);
    worker.once('message', (m) => {
      if (m?.ok) finish(resolve, m.v);
      else finish(reject, Object.assign(new Error(m?.err || 'backtest failed'), { status: 500 }));
    });
    worker.once('error', (e) => finish(reject, e));
    worker.once('exit', (code) => {
      if (!settled) finish(reject, Object.assign(new Error(`backtest worker exited ${code}`), { status: 500 }));
    });
  });
}
