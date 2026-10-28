#!/usr/bin/env bash
# Read-only Curvewatch production check. Run ON the VPS as root: bash handoff-verify.sh > verify.txt
# Prints no secrets. Does not restart, write to data/, or import src/version.js.
set -uo pipefail
APP=${APP:-/opt/curvewatch}
BASE=${BASE:-http://127.0.0.1:8080}
PW=$(grep -E '^DASHBOARD_PASSWORD=' "$APP/.env" | head -1 | cut -d= -f2- | tr -d "\"'")
AUTH=(-u "x:${PW}")
j() { if command -v jq >/dev/null; then jq "$@"; else cat; fi; }
api() { curl -fsS --max-time 20 "${AUTH[@]}" "$BASE$1" 2>&1; }

echo "== time"; date -u +%FT%TZ
echo "== services"; systemctl is-active curvewatch caddy
systemctl show curvewatch -p ActiveEnterTimestamp -p NRestarts -p MemoryCurrent
echo "== health"; curl -sS --max-time 10 "$BASE/health"; echo
echo "== restarts/oom last 24h"
journalctl -u curvewatch --since "-24h" --no-pager | grep -Eci 'started|out of memory|heap|killed' || true
journalctl -k --since "-24h" --no-pager 2>/dev/null | grep -ci 'oom' || true
echo "== warnings last 3h (tail)"
journalctl -u curvewatch --since "-3h" --no-pager -p warning | tail -n 40
echo "== git"; (cd "$APP" && git log -1 --oneline 2>/dev/null || echo "not a git checkout")
echo "== /api/status"
api /api/status | j '{healthy, cfg: (.cfg // .fingerprint // .version), feeds: [.feeds[]? | {name, healthy}]}'
echo "== /api/paper books"
api /api/paper | j '{cfg: .books.cfg, capitalPolicy: .books.capitalPolicy, capital: .books.books.capital, paired: .books.paired.capital, kill: .kill}'
echo "== /api/picks holders"
api "/api/picks?n=1" | j '.holders'
echo "== /api/studio/late"
api /api/studio/late | j '{version: (.version // .registration // null)}'
echo "== disk"; du -sh "$APP/data" 2>/dev/null; df -h / | tail -1
echo "== backups"; ls -lt "$APP/backups" 2>/dev/null | head -5; tail -3 /var/log/curvewatch-backup.log 2>/dev/null
echo "== watchdog"; tail -5 /var/log/curvewatch-watchdog.log 2>/dev/null
echo "== done"
