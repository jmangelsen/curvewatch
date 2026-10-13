// Telegram setup helper.
// 1. In Telegram, open @BotFather, send /newbot, and copy the token it gives you.
// 2. Open your new bot and send it /start (bots cannot message you first, and a @username is not enough).
// 3. Run:  TELEGRAM_BOT_TOKEN=123:abc npm run tg-setup
//    It prints the numeric chat id of everyone who has messaged the bot and sends each a test message.
// 4. Put TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env and restart Curvewatch.
import '../src/config.js'; // loads .env
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error('Set TELEGRAM_BOT_TOKEN first (from @BotFather).'); process.exit(1); }
const api = (m, body) => fetch(`https://api.telegram.org/bot${token}/${m}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined).then((r) => r.json());

const me = await api('getMe');
if (!me.ok) { console.error('Token rejected by Telegram:', me.description); process.exit(1); }
console.log(`Bot OK: @${me.result.username}`);
const up = await api('getUpdates');
const chats = new Map();
for (const u of up.result || []) { const c = (u.message || u.my_chat_member || u.channel_post)?.chat; if (c) chats.set(c.id, c); }
if (!chats.size) { console.log(`No messages yet. Open https://t.me/${me.result.username}, send /start, then run this again.`); process.exit(0); }
for (const c of chats.values()) {
  console.log(`chat_id ${c.id}  ${c.type}  ${c.username ? '@' + c.username : ''} ${c.title || [c.first_name, c.last_name].filter(Boolean).join(' ')}`);
  const r = await api('sendMessage', { chat_id: c.id, text: 'Curvewatch is connected. Strong signals will arrive here.' });
  console.log(r.ok ? '  test message sent' : `  send failed: ${r.description}`);
}
console.log('\nAdd to .env:\nTELEGRAM_BOT_TOKEN=<your token>\nTELEGRAM_CHAT_ID=<chat_id above>');
