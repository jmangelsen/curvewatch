// Fresh-database boot: the service must start on an empty DATA_DIR regardless of module import order (caught a
// prepare-at-import bug on the first VPS install). Passes when /health answers within 25 s.
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwboot-')), port = 8800 + Math.floor(Math.random() * 100);
const child = spawn(process.execPath, ['src/index.js'], { env: { ...process.env, DATA_DIR: dir, PORT: String(port), TELEGRAM_BOT_TOKEN: '', RUNNERS_ENABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
const t0 = Date.now(); let ok = false, exited = null; child.on('exit', (c) => { exited = c; });
while (Date.now() - t0 < 25000 && exited == null) {
  try { const r = await fetch(`http://127.0.0.1:${port}/health`); if (r.status === 200) { ok = true; break; } } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500));
}
child.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 300));
fs.rmSync(dir, { recursive: true, force: true });
if (!ok) { console.error(out.split('\n').filter((l) => /Error|error/.test(l)).slice(0, 8).join('\n')); console.error('FAIL fresh boot: /health never answered' + (exited != null ? ` (process exited ${exited})` : '')); process.exit(1); }
console.log('ok fresh database boots and /health answers'); console.log('1 fresh-boot tests passed');
