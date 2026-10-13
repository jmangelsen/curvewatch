// Base class: resilient single WebSocket with exponential backoff + stale-data watchdog.
// The watchdog matters: PumpPortal is known to stop delivering while the socket stays "open".
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { logger } from '../log.js';

export class Feed extends EventEmitter {
  constructor(name, { staleSec }) {
    super();
    this.name = name;
    this.log = logger(name);
    this.staleMs = staleSec * 1000;
    this.ws = null;
    this.backoff = 1000;
    this.stopped = false;
    this.stats = { connected: false, connects: 0, reconnects: 0, messages: 0, events: 0, bytes: 0, lastMessageAt: 0, lastEventAt: 0, lastError: null, since: 0 };
    this._rate = { t: Date.now(), m: 0, e: 0, b: 0, msgPerSec: 0, evPerSec: 0, kbPerSec: 0 };
  }
  url() { throw new Error('override'); }
  onOpen() {}
  onMessage() {}
  start() {
    this.stopped = false;
    this._connect();
    this.watchdog = setInterval(() => this._check(), 5000);
  }
  stop() { this.stopped = true; clearInterval(this.watchdog); try { this.ws?.terminate(); } catch {} }
  send(obj) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj)); }
  rates() {
    const r = this._rate, dt = (Date.now() - r.t) / 1000;
    if (dt >= 5) {
      r.msgPerSec = (this.stats.messages - r.m) / dt; r.evPerSec = (this.stats.events - r.e) / dt; r.kbPerSec = (this.stats.bytes - r.b) / 1024 / dt;
      r.t = Date.now(); r.m = this.stats.messages; r.e = this.stats.events; r.b = this.stats.bytes;
    }
    return { msgPerSec: r.msgPerSec, evPerSec: r.evPerSec, kbPerSec: r.kbPerSec };
  }
  healthy() { return this.stats.connected && Date.now() - this.stats.lastMessageAt < this.staleMs; }
  _connect() {
    if (this.stopped) return;
    const url = this.url();
    this.log.info(`connecting ${url.replace(/api-key=[^&]+/, 'api-key=***').replace(/api_key=[^&]+/, 'api_key=***')}`);
    const ws = new WebSocket(url, { handshakeTimeout: 15000, perMessageDeflate: false });
    this.ws = ws;
    ws.on('open', () => {
      this.stats.connected = true; this.stats.connects++; this.stats.since = Date.now(); this.stats.lastMessageAt = Date.now();
      this.backoff = 1000;
      this.log.info('connected');
      this.onOpen();
      this.emit('open');
    });
    ws.on('message', (data) => {
      this.stats.messages++; this.stats.bytes += data.length; this.stats.lastMessageAt = Date.now();
      let msg; try { msg = JSON.parse(data); } catch { return; }
      try { this.onMessage(msg); } catch (e) { this.log.warn('handler error', e.message); }
    });
    ws.on('error', (e) => { this.stats.lastError = e.message; this.log.warn('socket error', e.message); });
    ws.on('close', (code) => {
      this.stats.connected = false;
      if (this.ws !== ws) return;
      if (this.stopped) return;
      this.stats.reconnects++;
      this.log.warn(`closed (${code}); reconnecting in ${this.backoff}ms`);
      this.emit('down');
      setTimeout(() => this._connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 60000);
    });
  }
  _check() {
    if (!this.ws || this.stopped) return;
    if (this.stats.connected && Date.now() - this.stats.lastMessageAt > this.staleMs) {
      this.log.warn(`watchdog: no data for ${this.staleMs / 1000}s, forcing reconnect`);
      this.stats.lastError = 'stale';
      try { this.ws.terminate(); } catch {}
    }
  }
}
