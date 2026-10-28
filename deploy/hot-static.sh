#!/usr/bin/env bash
# Push dashboard-only changes (public/) to the VPS without restarting the collector.
# express.static reads from disk per request, so the next page load gets the new files; no process restart, no data gap.
# Use only when src/ did not change (a server change still needs deploy/provision-do.sh and a restart window).
# Host and key come from the environment. Nothing in this script names a production machine.
set -euo pipefail
IP="${CURVEWATCH_HOST:-${IP:-}}"
KEY="${CURVEWATCH_SSH_KEY:-${SSH_KEY:-${KEY:-}}}"
APP="${APP:-/opt/curvewatch}"
if [[ -z "$IP" || -z "$KEY" ]]; then
  echo "Set CURVEWATCH_HOST and CURVEWATCH_SSH_KEY (IP and KEY or SSH_KEY are accepted aliases). No production address is built in." >&2
  exit 1
fi
if [[ ! -f "$KEY" ]]; then
  echo "SSH key not found at the path in CURVEWATCH_SSH_KEY." >&2
  exit 1
fi
cd "$(dirname "$0")/.."
git diff --quiet HEAD -- src/ package.json 2>/dev/null || { echo "src/ has uncommitted changes; this script only ships public/"; exit 1; }
tar -C public -czf - . | ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=15 "root@$IP" "tar -C $APP/public -xzf - && chown -R curvewatch:curvewatch $APP/public 2>/dev/null || true && systemctl is-active curvewatch"
echo "static files updated on the configured host without a restart"
