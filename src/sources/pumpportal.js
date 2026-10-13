// PumpPortal WebSocket: free token-creation + migration (graduation) streams.
// Optional metered per-token trade subscriptions when TRADE_SOURCE=pumpportal.
import { Feed } from './feed.js';
import { config } from '../config.js';

export class PumpPortalFeed extends Feed {
  constructor() {
    super('pumpportal', { staleSec: config.pumpportal.staleSec });
    this.tradeKeys = new Set();
  }
  url() {
    const k = config.pumpportal.apiKey;
    return k ? `${config.pumpportal.url}?api-key=${encodeURIComponent(k)}` : config.pumpportal.url;
  }
  onOpen() {
    this.send({ method: 'subscribeNewToken' });
    this.send({ method: 'subscribeMigration' });
    if (this.tradeKeys.size) this.send({ method: 'subscribeTokenTrade', keys: [...this.tradeKeys] });
  }
  watchTrades(mint) {
    if (config.tradeSource !== 'pumpportal' || this.tradeKeys.has(mint)) return;
    this.tradeKeys.add(mint); this.send({ method: 'subscribeTokenTrade', keys: [mint] });
  }
  unwatchTrades(mint) {
    if (!this.tradeKeys.delete(mint)) return;
    this.send({ method: 'unsubscribeTokenTrade', keys: [mint] });
  }
  onMessage(m) {
    if (m.message) { if (/only available|error|invalid/i.test(m.message)) this.log.warn(m.message); return; }
    const recvAt = Date.now();
    if (m.txType === 'create') {
      this.stats.events++; this.stats.lastEventAt = recvAt;
      this.emit('create', {
        kind: 'create', src: 'pumpportal', recvAt, mint: m.mint, name: m.name, symbol: m.symbol, uri: m.uri,
        creator: m.traderPublicKey, sig: m.signature, initialBuyTok: m.initialBuy || 0, initialBuySol: m.solAmount || 0,
        vsol: m.vSolInBondingCurve, vtok: m.vTokensInBondingCurve, pool: m.pool, mayhem: !!m.is_mayhem_mode, slot: null,
      });
      // PumpPortal's create message carries the dev's initial buy; surface it as a trade too.
      if (m.initialBuy > 0 && m.solAmount > 0) {
        this.emit('trade', { kind: 'trade', src: 'pumpportal', recvAt, mint: m.mint, sol: m.solAmount, tok: m.initialBuy, isBuy: true,
          wallet: m.traderPublicKey, vsol: m.vSolInBondingCurve, vtok: m.vTokensInBondingCurve, rtok: null, slot: null, sig: m.signature, ts: Math.floor(recvAt / 1000) });
      }
    } else if (m.txType === 'migrate') {
      this.stats.events++; this.stats.lastEventAt = recvAt;
      this.emit('migrate', { kind: 'migrate', src: 'pumpportal', recvAt, mint: m.mint, pool: m.pool, sig: m.signature });
    } else if (m.txType === 'buy' || m.txType === 'sell') {
      this.stats.events++; this.stats.lastEventAt = recvAt;
      this.emit('trade', { kind: 'trade', src: 'pumpportal', recvAt, mint: m.mint, sol: m.solAmount, tok: m.tokenAmount, isBuy: m.txType === 'buy',
        wallet: m.traderPublicKey, vsol: m.vSolInBondingCurve, vtok: m.vTokensInBondingCurve, rtok: null, slot: null, sig: m.signature, ts: Math.floor(recvAt / 1000) });
    }
  }
}
