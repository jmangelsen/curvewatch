// Telegram delivery for alerts, system warnings, daily summaries.
import { config } from '../config.js';
import { logger } from '../log.js';
const log = logger('telegram');
const q = [];
let busy = false;
export const tgEnabled = () => !!(config.telegram.botToken && config.telegram.chatId) && config.telegram.mode !== 'off';
const sentStats = { sent: 0, failed: 0, lastOkAt: null, lastError: null };
export const tgStats = () => ({ ...sentStats, mode: config.telegram.mode, enabled: tgEnabled(), separateStrongChat: !!config.telegram.strongChatId });

/** kind: 'alert' (regular screener alert), 'strong' (strong signal), 'system' (health, summaries) */
export function notify(html, kind = 'system') {
  if (!tgEnabled()) return false;
  if (kind === 'alert' && config.telegram.mode !== 'all') return false;
  const chat = kind === 'strong' && config.telegram.strongChatId ? config.telegram.strongChatId : config.telegram.chatId;
  q.push({ text: html, chat }); drain(); return true;
}
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function sendTelegram(html) { return notify(html, 'system'); }
async function drain() {
  if (busy) return; busy = true;
  while (q.length) {
    const item = q.shift(); const { text, chat } = item;
    try {
      const r = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10000),
      });
      if (r.status === 429) { const j = await r.json().catch(() => ({})); q.unshift(item); await new Promise((s) => setTimeout(s, ((j.parameters?.retry_after) || 3) * 1000)); continue; }
      if (!r.ok) { const body = await r.text(); sentStats.failed++; sentStats.lastError = `${r.status} ${body.slice(0, 160)}`; log.warn(`send failed ${r.status}`, body); }
      else { sentStats.sent++; sentStats.lastOkAt = Date.now(); }
    } catch (e) { sentStats.failed++; sentStats.lastError = e.message; log.warn('send error', e.message); }
    await new Promise((s) => setTimeout(s, 1100)); // stay under 1 msg/sec per chat
  }
  busy = false;
}
