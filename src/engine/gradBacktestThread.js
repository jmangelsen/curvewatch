// Worker entry: graduate backtest off the collector's event loop. One shot, then exit.
import { parentPort, workerData } from 'node:worker_threads';
import './graduates.js'; // owns grad_snapshots; the worker process has not imported it yet
import { runGradBacktest } from './gradBacktest.js';

try {
  const v = runGradBacktest(workerData || {});
  parentPort.postMessage({ ok: true, v });
} catch (e) {
  parentPort.postMessage({ ok: false, err: e.message });
}
