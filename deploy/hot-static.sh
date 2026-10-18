#!/usr/bin/env bash
# Push dashboard-only changes (public/) to the VPS without restarting the collector.
# express.static reads from disk per request, so the next page load gets the new files; no process restart, no data gap.
# Use only when src/ did not change (a server change still needs deploy/provision-do.sh and a restart window).
set -euo pipefail
IP="${IP:-157.245.232.158}"; KEY="${KEY:-$HOME/.ssh/curvewatch_deploy}"; APP=/opt/curvewatch
cd "$(dirname "$0")/.."
git diff --quiet HEAD -- src/ package.json 2>/dev/null || { echo "src/ has uncommitted changes; this script only ships public/"; exit 1; }
tar -C public -czf - . | ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=15 "root@$IP" "tar -C $APP/public -xzf - && chown -R curvewatch:curvewatch $APP/public 2>/dev/null || true && systemctl is-active curvewatch"
echo "static files updated on $IP without a restart"
