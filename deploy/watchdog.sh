#!/usr/bin/env bash
# Curvewatch watchdog: cron every 5 min. systemd restarts a crashed process; this catches the other failure, a process that
# is alive but whose feeds have been dead for 10+ minutes (stuck websocket, DNS, RPC ban). Three consecutive unhealthy
# checks → restart the unit, log it, and tell Telegram if a token is configured. Never restarts more than once per 30 min.
set -u
APP=${APP:-/opt/curvewatch}; STATE=/var/tmp/curvewatch-watchdog; mkdir -p "$STATE"
LOG=/var/log/curvewatch-watchdog.log
now=$(date +%s)
health=$(curl -fsS --max-time 8 localhost:8080/health 2>/dev/null || echo '')
healthy=$(printf '%s' "$health" | grep -o '"ok":true' || true)
if [ -n "$healthy" ]; then rm -f "$STATE/fails"; exit 0; fi
fails=$(( $(cat "$STATE/fails" 2>/dev/null || echo 0) + 1 )); echo "$fails" > "$STATE/fails"
echo "$(date -Is) unhealthy check #$fails: ${health:-no response}" >> "$LOG"
[ "$fails" -lt 3 ] && exit 0
last=$(cat "$STATE/last_restart" 2>/dev/null || echo 0)
[ $(( now - last )) -lt 1800 ] && { echo "$(date -Is) restart suppressed (last one $(( (now - last) / 60 )) min ago)" >> "$LOG"; exit 0; }
echo "$now" > "$STATE/last_restart"; rm -f "$STATE/fails"
systemctl restart curvewatch
echo "$(date -Is) RESTARTED curvewatch after $fails unhealthy checks" >> "$LOG"
# Telegram, if configured (read-only parse of .env; no sourcing)
TOK=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$APP/.env" 2>/dev/null | cut -d= -f2-); CHAT=$(grep -E '^TELEGRAM_CHAT_ID=' "$APP/.env" 2>/dev/null | cut -d= -f2-)
if [ -n "$TOK" ] && [ -n "$CHAT" ]; then
  curl -fsS --max-time 8 -X POST "https://api.telegram.org/bot${TOK}/sendMessage" -d chat_id="$CHAT" -d text="System · watchdog restarted Curvewatch on $(hostname) after 15 min unhealthy. Check: journalctl -u curvewatch -n 50" >/dev/null 2>&1 || true
fi
