// install-systemd.sh git-diff guard: a zip directory is not a checkout and must not fail the install.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const script = path.resolve(new URL('../deploy/install-systemd.sh', import.meta.url).pathname);
const run = (dir) => spawnSync('bash', [script, '--guard-only', dir], { encoding: 'utf8' });

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('not a git checkout warns and continues', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-guard-zip-'));
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /not a git checkout; skipping the git-diff guard/);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('a clean checkout passes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-guard-git-'));
  const git = (args) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  };
  git(['init']);
  git(['config', 'user.email', 'guard@example.com']);
  git(['config', 'user.name', 'guard']);
  fs.writeFileSync(path.join(dir, 'readme.txt'), 'ok\n');
  git(['add', 'readme.txt']);
  git(['commit', '-m', 'init']);
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /skipping the git-diff guard/);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('a dirty checkout is refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-guard-dirty-'));
  const git = (args) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  };
  git(['init']);
  git(['config', 'user.email', 'guard@example.com']);
  git(['config', 'user.name', 'guard']);
  fs.writeFileSync(path.join(dir, 'readme.txt'), 'ok\n');
  git(['add', 'readme.txt']);
  git(['commit', '-m', 'init']);
  fs.writeFileSync(path.join(dir, 'readme.txt'), 'changed\n');
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /git diff is not empty/);
  fs.rmSync(dir, { recursive: true, force: true });
});

console.log(`${n} install-guard tests passed`);
