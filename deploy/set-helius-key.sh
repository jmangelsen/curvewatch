#!/usr/bin/env bash
# Store a Helius API key on this server without it ever appearing in a chat, a shell history line, or a log.
# Usage (on the server, as root):  bash /opt/curvewatch/deploy/set-helius-key.sh
set -euo pipefail
ENV_FILE="${ENV_FILE:-/opt/curvewatch/.env}"
read -r -s -p "Paste your Helius API key (input hidden), then press Enter: " KEY; echo
KEY="${KEY//[[:space:]]/}"
[[ ${#KEY} -ge 20 ]] || { echo "That does not look like a Helius key (too short)."; exit 1; }
echo "Checking the key with one DAS call (10 credits)..."
RESP=$(curl -fsS -m 15 "https://mainnet.helius-rpc.com/?api-key=${KEY}" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"cw","method":"getTokenAccounts","params":{"mint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","limit":1}}' || true)
if ! grep -q '"token_accounts"' <<<"$RESP"; then echo "Key rejected or no DAS access: ${RESP:0:200}"; exit 1; fi
touch "$ENV_FILE"; chmod 600 "$ENV_FILE"
grep -v '^HELIUS_API_KEY=' "$ENV_FILE" > "$ENV_FILE.tmp" || true
printf 'HELIUS_API_KEY=%s\n' "$KEY" >> "$ENV_FILE.tmp"; mv "$ENV_FILE.tmp" "$ENV_FILE"; chmod 600 "$ENV_FILE"
unset KEY
systemctl restart curvewatch
sleep 8
journalctl -u curvewatch --since "-20s" --no-pager | grep -E "\[holders\]" | sed -E 's/^.*curvewatch\[[0-9]+\]: //' | tail -1 || true
echo "Done. Holder counts appear on the Runners tab and in the bot within about 10 minutes."
