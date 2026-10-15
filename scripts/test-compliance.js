// Disclosures: one source, every surface. Checks the Telegram texts fit the 4096-char limit and the exports carry the block.
import assert from 'node:assert/strict';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cwcp-'));
const C = await import('../src/compliance.js'); const { config } = await import('../src/config.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
t('Telegram: footer, daily block and weekly full text fit the API limit with room for the message', () => {
  assert.ok(C.TELEGRAM_FOOTER.length < 200); assert.ok(C.TELEGRAM_DAILY_BLOCK.length < 400);
  assert.ok(C.telegramFullText((x) => x).length < 3600, 'full disclosures must leave headroom under 4096');
  for (const s of C.SECTIONS) assert.ok(C.telegramFullText((x) => x).includes(s.h));
});
t('every section names the four load-bearing facts somewhere', () => {
  const all = C.SECTIONS.map((s) => s.p).join(' ');
  for (const must of ['simulated', 'No actual trades', 'not', 'entire amount', 'no compensation'.replace('no c', 'no c')]) assert.ok(new RegExp(must, 'i').test(all), must);
});
t('markdown export block has the notice, all sections and the parameter table', () => {
  const md = C.markdownBlock(config);
  assert.ok(md.startsWith('## Disclosures')); assert.ok(md.includes(C.API_NOTICE)); assert.ok(md.includes('| Setting | Value |'));
  for (const s of C.SECTIONS) assert.ok(md.includes(`**${s.h}.**`));
  assert.equal(C.simulationParams(config).length, 6);
});
console.log(`${n} compliance tests passed`);
