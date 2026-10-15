// Telegram lookup bot: link/mint parsing and the card on a token this machine has never seen.
import assert from 'node:assert/strict';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cwtg-'));
await import('../src/engine/graduates.js'); // creates the grad_* tables, as the app does before the bot starts
const { extractMint, tokenCard } = await import('../src/engine/tgBot.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const M = '33jENUQnjoitkMFpvNJcSHyLAHFWJuHwT6E3E8CNpump';
t('extracts a mint from links and bare text, ignores noise', () => {
  assert.equal(extractMint(`https://pump.fun/coin/${M}`), M);
  assert.equal(extractMint(`https://pump.fun/${M}?x=1`), M);
  assert.equal(extractMint(`check https://dexscreener.com/solana/${M}`), M);
  assert.equal(extractMint(`what about ${M} ?`), M);
  assert.equal(extractMint('hello there'), null);
  assert.equal(extractMint('/status'), null);
});
t('unknown token gets a "no record" card, never invented numbers', () => {
  const card = tokenCard(M, { engine: { getToken: () => undefined }, grads: { watch: new Map() }, strong: { history: () => ({ n: 0 }) } });
  assert.ok(card.includes('no record')); assert.ok(!card.includes('Score:')); assert.ok(card.includes('Not an entry recommendation'));
  for (const w of ['buy', 'sell', 'target']) assert.ok(!new RegExp(`\\b${w}\\b`, 'i').test(card), w);
});
console.log(`${n} tgbot tests passed`);
