#!/usr/bin/env python3
"""Reconstruct a token's holder timeline from the chain (research tool, Hypothesis 3).

For one mint: list every token account via Helius DAS getTokenAccounts (including emptied accounts that are still
open), then for each account fetch its signature history (getSignaturesForAddress, 1 credit per call) to find the
first and last time it was touched. Rows go to holder_entries in the Curvewatch database; resumable, so a run can be
cut at the credential window and continued.

holders_at(t) ~= accounts first touched by t  minus  accounts now empty whose last touch was by t.
Known gaps: accounts closed outright are invisible (undercount), partial sells are not timed (slight overcount).

Usage (inside the credential proxy, which injects the api-key):
  pplx credentials run <helius-handle> -- python3 scripts/holder-timeline.py <mint> [--budget-sec 780] [--rps 9]
"""
import argparse, json, os, sqlite3, subprocess, sys, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed
# HTTP goes through curl: the credential proxy's CA is accepted by curl but rejected by Python 3.14's stricter ssl checks.

RPC = 'https://mainnet.helius-rpc.com/'
ap = argparse.ArgumentParser()
ap.add_argument('mint'); ap.add_argument('--budget-sec', type=float, default=780); ap.add_argument('--rps', type=float, default=9)
ap.add_argument('--max-pages', type=int, default=3, help='signature pages (1000 each) per account before giving up on the oldest')
ap.add_argument('--db', default=os.path.join(os.environ.get('DATA_DIR', 'data'), 'curvewatch.db'))
a = ap.parse_args()
t_start = time.time()
db = sqlite3.connect(a.db, timeout=30); db.execute('PRAGMA journal_mode=WAL')
db.execute('''CREATE TABLE IF NOT EXISTS holder_entries (mint TEXT NOT NULL, account TEXT NOT NULL, owner TEXT, amount REAL, first_ts INTEGER, last_ts INTEGER, n_sigs INTEGER, truncated INTEGER DEFAULT 0, PRIMARY KEY (mint, account))''')
db.execute('''CREATE TABLE IF NOT EXISTS holder_timeline_runs (mint TEXT PRIMARY KEY, accounts INTEGER, done INTEGER, calls INTEGER, started_at INTEGER, finished_at INTEGER)''')
db.commit()

lock = threading.Lock(); calls = 0; last = [0.0]
def pace():
    with lock:
        now = time.time(); wait = last[0] + 1.0 / a.rps - now
        if wait > 0: time.sleep(wait)
        last[0] = max(now, last[0] + 1.0 / a.rps)
def rpc(method, params, tries=6):
    global calls
    body = json.dumps({'jsonrpc': '2.0', 'id': 'cw', 'method': method, 'params': params})
    for i in range(tries):
        pace()
        p = subprocess.run(['curl', '-sS', '--max-time', '30', '-w', '\n%{http_code}', '-X', 'POST', RPC, '-H', 'content-type: application/json', '-d', body], capture_output=True, text=True)
        with lock: calls += 1
        out = p.stdout.rsplit('\n', 1); code = out[-1].strip() if len(out) == 2 else ''
        if code == '429' or code.startswith('5') or code == '':
            if i >= 2: print('http', repr(code), p.stderr.strip()[:120], file=sys.stderr)
            time.sleep(1.5 * (i + 1)); continue
        try:
            j = json.loads(out[0])
        except ValueError:
            if i >= 2: print('badjson', repr(out[0][:120]), file=sys.stderr)
            time.sleep(1.0 * (i + 1)); continue
        if 'error' in j:
            if 'rate' in str(j['error']).lower(): time.sleep(1.5 * (i + 1)); continue
            raise RuntimeError(j['error'])
        return j['result']
    raise RuntimeError(f'{method} failed after {tries} tries')

# 1. token accounts (DAS, 10 credits per page, 2 req/s)
accounts = {}
page = 1
while True:
    time.sleep(0.55)
    res = rpc('getTokenAccounts', {'mint': a.mint, 'limit': 1000, 'page': page, 'options': {'showZeroBalance': True}})
    rows = res.get('token_accounts') or []
    for t in rows: accounts[t['address']] = (t.get('owner'), float(t.get('amount') or 0))
    if len(rows) < 1000: break
    page += 1
known = {r[0] for r in db.execute('SELECT account FROM holder_entries WHERE mint=?', (a.mint,))}
todo = [acc for acc in accounts if acc not in known]
db.execute('INSERT INTO holder_timeline_runs (mint, accounts, done, calls, started_at) VALUES (?,?,?,?,?) ON CONFLICT(mint) DO UPDATE SET accounts=excluded.accounts', (a.mint, len(accounts), len(known), 0, int(t_start * 1000)))
db.commit()
print(f'{a.mint}: {len(accounts)} token accounts ({page} DAS pages), {len(known)} already done, {len(todo)} to fetch', flush=True)

# 2. first/last touch per account
def probe(acc):
    first = last_ts = None; n = 0; before = None; truncated = 0
    for p in range(a.max_pages):
        sigs = rpc('getSignaturesForAddress', [acc, {'limit': 1000, **({'before': before} if before else {})}])
        if not sigs: break
        n += len(sigs)
        if last_ts is None: last_ts = sigs[0].get('blockTime')
        first = sigs[-1].get('blockTime'); before = sigs[-1]['signature']
        if len(sigs) < 1000: break
    else:
        truncated = 1
    return acc, first, last_ts, n, truncated

done = 0; buf = []
def flush():
    global buf
    if not buf: return
    db.executemany('INSERT OR REPLACE INTO holder_entries (mint, account, owner, amount, first_ts, last_ts, n_sigs, truncated) VALUES (?,?,?,?,?,?,?,?)', buf)
    db.execute('UPDATE holder_timeline_runs SET done=(SELECT COUNT(*) FROM holder_entries WHERE mint=?), calls=calls+? WHERE mint=?', (a.mint, len(buf), a.mint))
    db.commit(); buf = []
with ThreadPoolExecutor(max_workers=6) as ex:
    futs = {}
    it = iter(todo)
    for acc in it:
        futs[ex.submit(probe, acc)] = acc
        if len(futs) >= 12: break
    while futs:
        for f in as_completed(list(futs)):
            acc = futs.pop(f)
            try:
                _, first, last_ts, n, tr = f.result()
                owner, amt = accounts[acc]
                buf.append((a.mint, acc, owner, amt, (first or 0) * 1000, (last_ts or 0) * 1000, n, tr)); done += 1
            except Exception as e:
                print('skip', acc, e, file=sys.stderr)
            if len(buf) >= 50: flush()
            if time.time() - t_start < a.budget_sec:
                nxt = next(it, None)
                if nxt: futs[ex.submit(probe, nxt)] = nxt
            break
flush()
remaining = len(todo) - done
if remaining <= 0: db.execute('UPDATE holder_timeline_runs SET finished_at=? WHERE mint=?', (int(time.time() * 1000), a.mint)); db.commit()
print(f'done {done} this run, {remaining} remaining, {calls} RPC calls, {time.time() - t_start:.0f}s', flush=True)
