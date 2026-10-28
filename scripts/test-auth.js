// Auth fail-closed, loopback bind, constant-time compare, and the verify script's curl config.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-auth-'));
process.env.DATA_DIR = dir;
process.env.LOG_LEVEL = 'error';
delete process.env.DASHBOARD_PASSWORD;
delete process.env.CURVEWATCH_ALLOW_UNAUTHENTICATED;
delete process.env.BIND_HOST;

const { config } = await import('../src/config.js');
const { passwordsMatch, basicPassword } = await import('../src/auth.js');
const { startServer } = await import('../src/server.js');

let n = 0;
const test = (name, fn) => tests.push([name, fn]);
const tests = [];

test('password compare is equal only for the same string and does not throw on length mismatch', () => {
  assert.equal(passwordsMatch('s3cret', 's3cret'), true);
  assert.equal(passwordsMatch('s3cret', 's3creT'), false);
  assert.equal(passwordsMatch('a', 'ab'), false);
  assert.equal(passwordsMatch('', ''), true);
  assert.equal(passwordsMatch('x', ''), false);
});

test('basic auth keeps the password after the first colon', () => {
  const header = `Basic ${Buffer.from('anyone:p:ass:word', 'utf8').toString('base64')}`;
  assert.equal(basicPassword(header), 'p:ass:word');
  assert.equal(basicPassword(''), '');
  assert.equal(basicPassword('Bearer abc'), '');
});

function stubs() {
  return {
    engine: { on() {}, radar() { return []; }, getToken() { return null; } },
    grads: { on() {}, paperEvents: [] },
    codex: { pulse() { return {}; } },
    status: () => ({ healthy: true, feeds: [] }),
  };
}
const authHeader = (user, pass) => ({ authorization: `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}` });

async function boot() {
  config.port = 0;
  config.bindHost = '127.0.0.1';
  const server = startServer(stubs());
  await new Promise((resolve, reject) => {
    if (server.listening) resolve();
    else server.once('listening', resolve);
    server.once('error', reject);
  });
  const addr = server.address();
  return { server, port: addr.port, host: addr.address };
}

test('default bind is loopback and a missing password locks everything except /health', async () => {
  assert.equal(config.bindHost, '127.0.0.1');
  config.dashboardPassword = '';
  config.allowUnauthenticated = false;
  const { server, port, host } = await boot();
  try {
    assert.equal(host, '127.0.0.1');
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);
    const locked = await fetch(`http://127.0.0.1:${port}/api/status`);
    assert.equal(locked.status, 401);
    const root = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(root.status, 401);
  } finally { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); }
});

test('explicit dev opt-out opens the dashboard only when no password is set', async () => {
  config.dashboardPassword = '';
  config.allowUnauthenticated = true;
  const open = await boot();
  try {
    const res = await fetch(`http://127.0.0.1:${open.port}/api/status`);
    assert.equal(res.status, 200);
  } finally { open.server.closeAllConnections?.(); await new Promise((r) => open.server.close(r)); }

  config.dashboardPassword = 'unit-secret';
  config.allowUnauthenticated = true;
  const guarded = await boot();
  try {
    const no = await fetch(`http://127.0.0.1:${guarded.port}/api/status`);
    assert.equal(no.status, 401);
    const bad = await fetch(`http://127.0.0.1:${guarded.port}/api/status`, { headers: authHeader('x', 'nope') });
    assert.equal(bad.status, 401);
    const ok = await fetch(`http://127.0.0.1:${guarded.port}/api/status`, { headers: authHeader('anyone', 'unit-secret') });
    assert.equal(ok.status, 200);
  } finally { guarded.server.closeAllConnections?.(); await new Promise((r) => guarded.server.close(r)); }
});

test('hot-static.sh has no built-in production host and requires env', () => {
  const sh = fs.readFileSync(new URL('../deploy/hot-static.sh', import.meta.url), 'utf8');
  assert.doesNotMatch(sh, /157\.245\.232\.158/);
  assert.doesNotMatch(sh, /curvewatch_deploy/);
  const env = { PATH: process.env.PATH, HOME: os.tmpdir() };
  const r = spawnSync('bash', ['deploy/hot-static.sh'], { cwd: path.resolve(new URL('..', import.meta.url).pathname), env, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(`${r.stderr}`, /CURVEWATCH_HOST/);
});

test('handoff-verify.sh sends the password via a 600 curl config, not argv', async () => {
  const sh = fs.readFileSync(new URL('./handoff-verify.sh', import.meta.url), 'utf8');
  assert.match(sh, /--config/);
  assert.match(sh, /chmod 600/);
  assert.doesNotMatch(sh, /curl[^\n]*\s-u\s/);
  const password = 'unit"pass\\word';
  const seen = [];
  const srv = http.createServer((req, res) => { seen.push(req.headers.authorization || ''); res.end('{}'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-verify-'));
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-bin-'));
  fs.writeFileSync(path.join(app, '.env'), `DASHBOARD_PASSWORD=${password}\n`, { mode: 0o600 });
  for (const name of ['systemctl', 'journalctl']) fs.writeFileSync(path.join(bin, name), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const r = await new Promise((resolve, reject) => {
    const child = spawn('bash', [new URL('./handoff-verify.sh', import.meta.url).pathname], {
      env: { PATH: `${bin}:${process.env.PATH}`, APP: app, BASE: `http://127.0.0.1:${port}`, HOME: os.tmpdir() },
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  await new Promise((res) => srv.close(res));
  fs.rmSync(app, { recursive: true, force: true });
  fs.rmSync(bin, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const basic = seen.find((h) => String(h).startsWith('Basic '));
  assert.ok(basic, 'curl reached the stub with basic auth');
  const decoded = Buffer.from(basic.replace(/^Basic /, ''), 'base64').toString('utf8');
  assert.equal(decoded, `x:${password}`);
  assert.doesNotMatch(r.stdout, /unit/);
});

let fail = 0;
for (const [name, fn] of tests) {
  try { await fn(); n++; console.log('ok', name); }
  catch (e) { fail++; console.log('FAIL', name, e.message); }
}
fs.rmSync(dir, { recursive: true, force: true });
if (fail) { console.error(`${fail} auth tests failed`); process.exit(1); }
console.log(`${n} auth tests passed`);
process.exit(0);
