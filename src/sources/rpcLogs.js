// Free firehose of every Pump.fun trade/create/complete, decoded from program logs via logsSubscribe.
// Rotates through RPC_WS_URLS on failure. Includes the slot number of every trade (bundle detection).
import { Feed } from './feed.js';
import { eventsFromLogs } from './decode.js';
import { config } from '../config.js';

export class RpcLogsFeed extends Feed {
  constructor(i = 0) {
    super(i ? `rpc${i + 1}` : 'rpc', { staleSec: config.rpc.staleSec });
    this.urls = config.rpc.wsUrls;
    this.idx = i - 1; // stagger which URL each parallel connection starts on
    this.stats.failedTx = 0;
  }
  url() { this.idx = (this.idx + 1) % this.urls.length; return this.urls[this.idx]; }
  onOpen() {
    this.send({ jsonrpc: '2.0', id: 1, method: 'logsSubscribe', params: [{ mentions: [config.pumpProgramId] }, { commitment: config.rpc.commitment }] });
  }
  onMessage(msg) {
    if (msg.error) { this.log.error('rpc error', msg.error); this.stats.lastError = msg.error.message; return; }
    const res = msg?.params?.result;
    if (!res) return;
    const v = res.value;
    if (v.err) { this.stats.failedTx++; return; }
    const evs = eventsFromLogs(v.logs || []);
    if (!evs.length) return;
    const slot = res.context?.slot ?? null;
    const recvAt = Date.now();
    for (const ev of evs) {
      ev.slot = slot; ev.sig = v.signature; ev.recvAt = recvAt; ev.src = 'rpc';
      this.stats.events++; this.stats.lastEventAt = recvAt;
      this.emit(ev.kind, ev);
    }
  }
}
