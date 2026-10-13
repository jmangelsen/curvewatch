// Telegram delivery for alerts, system warnings, daily summaries.
import { config } from '../config.js';
import { logger } from '../log.js';
const log = logger('telegram');
const q = [];
let busy = false;
export const tgEnabled = () => !!(config.telegram.botToken && config.telegram.chatId);
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function sendTelegram(html) {
  if (!tgEnabled()) return;
  q.push(html); drain();
}
async function drain() {
  if (busy) return; busy = true;
  while (q.length) {
    const text = q.shift();
    try {
      const r = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: config.telegram.chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10000),
      });
      if (r.status === 429) { const j = await r.json().catch(() => ({})); q.unshift(text); await new Promise((s) => setTimeout(s, ((j.parameters?.retry_after) || 3) * 1000)); continue; }
      if (!r.ok) log.warn(`send failed ${r.status}`, await r.text());
    } catch (e) { log.warn('send error', e.message); }
    await new Promise((s) => setTimeout(s, 1100)); // stay under 1 msg/sec per chat
  }
  busy = false;
}
