// Heavy endpoints stay off the collector thread and cannot be repeated inside the window.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-heavy-'));
process.env.DATA_DIR = dir;
process.env.LOG_LEVEL = 'error';
delete process.env.DASHBOARD_PASSWORD;
delete process.env.TELEGRAM_BOT_TOKEN;

const { allowHeavy, resetHeavy } = await import('../src/heavyLimit.js');
const { config } = await import('../src/config.js');
const { startServer } = await import('../src/server.js');

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('ok', name); };

await test('allowHeavy permits one call per window', () => {
  resetHeavy();
  assert.equal(allowHeavy('x', 1000, 5000), true);
  assert.equal(allowHeavy('x', 1000, 5500), false);
  assert.equal(allowHeavy('x', 1000, 6000), true);
  assert.equal(allowHeavy('y', 1000, 5500), true);
});

config.dashboardPassword = 'unit-secret';
config.allowUnauthenticated = false;
config.bindHost = '127.0.0.1';
config.port = 0;
config.telegram.botToken = 'test-token-not-real';
config.telegram.chatId = '1';
config.telegram.mode = 'strong';
const origFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).includes('api.telegram.org')) return { ok: true, status: 200, text: async () => '', json: async () => ({}) };
  return origFetch(url);
};
const auth = { authorization: `Basic ${Buffer.from('x:unit-secret', 'utf8').toString('base64')}` };
const server = startServer({
  engine: { on() {}, radar() { return []; }, getToken() { return null; } },
  grads: { on() {}, paperEvents: [], solUsd: 100 },
  codex: { pulse() { return {}; } },
  status: () => ({ healthy: true, feeds: [] }),
  strong: { view() { return {}; } },
});
await new Promise((resolve, reject) => {
  if (server.listening) resolve();
  else server.once('listening', resolve);
  server.once('error', reject);
});
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

await test('telegram test is rate-limited and the backtest runs off a second response', async () => {
  resetHeavy();
  const a = await origFetch(`${base}/api/telegram/test`, { method: 'POST', headers: auth });
  assert.equal(a.status, 200);
  const b = await origFetch(`${base}/api/telegram/test`, { method: 'POST', headers: auth });
  assert.equal(b.status, 429);
  const bt = await origFetch(`${base}/api/grads/backtest`, { headers: auth });
  const body = await bt.json();
  assert.equal(bt.status, 200, JSON.stringify(body));
  assert.ok(Array.isArray(body.results));
  const again = await origFetch(`${base}/api/grads/backtest`, { headers: auth });
  assert.equal(again.status, 429);
});

await new Promise((r) => server.close(r));
globalThis.fetch = origFetch;
console.log(`${n} heavy-endpoint tests passed`);
process.exit(0);
