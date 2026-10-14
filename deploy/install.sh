#!/usr/bin/env bash
# Curvewatch one-command install for a fresh Ubuntu 24.04 VPS. Run as root from the project folder:
#   cd /opt/curvewatch && bash deploy/install.sh
# Safe to re-run: it never overwrites an existing .env or data/.
set -euo pipefail
cd "$(dirname "$0")/.."
APP="$(pwd)"
say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

say "1/6 System packages, Docker, firewall, swap, security updates"
if ! command -v docker >/dev/null 2>&1; then bash deploy/setup-vps.sh; else echo "Docker already installed, skipping."; fi

say "2/6 Configuration (.env)"
if [ ! -f .env ]; then
  cp .env.example .env
  PW="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-28)"
  sed -i "s|^DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=${PW}|" .env
  echo "Created .env with a random dashboard password: ${PW}"
  echo "Save it now. It is also in ${APP}/.env"
else
  echo ".env exists, leaving it unchanged."
fi
read -r -p "Telegram bot token (Enter to skip; add later in .env): " TG || true
if [ -n "${TG:-}" ]; then
  sed -i "s|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=${TG}|" .env
  echo "Open your bot in Telegram and send /start, then press Enter."; read -r _ || true
  CHAT="$(curl -fsS "https://api.telegram.org/bot${TG}/getUpdates" | grep -o '"chat":{"id":-\?[0-9]*' | head -1 | grep -o -- '-\?[0-9]*$' || true)"
  if [ -n "$CHAT" ]; then sed -i "s|^TELEGRAM_CHAT_ID=.*|TELEGRAM_CHAT_ID=${CHAT}|" .env; echo "chat_id ${CHAT} saved."
  else echo "No chat found. Send /start to the bot and re-run this script, or set TELEGRAM_CHAT_ID in .env."; fi
fi
read -r -p "healthchecks.io ping URL (Enter to skip): " HC || true
[ -n "${HC:-}" ] && sed -i "s|^HEALTHCHECK_URL=.*|HEALTHCHECK_URL=${HC}|" .env
mkdir -p data backups

say "3/6 Build and start (first build takes 2-4 minutes)"
docker compose up -d --build

say "4/6 Waiting for health"
for i in $(seq 1 40); do
  if curl -fsS localhost:8080/health >/dev/null 2>&1; then echo "healthy: $(curl -fsS localhost:8080/health)"; break; fi
  sleep 3; [ "$i" = 40 ] && { echo "Not healthy after 2 min. Logs:"; docker compose logs --tail 80 curvewatch; exit 1; }
done

say "5/6 Nightly backup + weekly backtest (cron)"
chmod +x deploy/backup.sh
( crontab -l 2>/dev/null | grep -v curvewatch ; \
  echo "15 3 * * * ${APP}/deploy/backup.sh >> /var/log/curvewatch-backup.log 2>&1 # curvewatch"; \
  echo "0 7 * * 1 cd ${APP} && docker compose exec -T curvewatch node scripts/backtest.js 120 >> ${APP}/backups/backtest.log 2>&1 # curvewatch" ) | crontab -
crontab -l | grep curvewatch

say "6/6 Done"
IP="$(curl -fsS -4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
cat <<EOF
Curvewatch is collecting data 24/7 (Docker restarts it on crash and reboot).

Open the dashboard from YOUR computer through an SSH tunnel (nothing exposed publicly):
  ssh -L 8080:localhost:8080 root@${IP}
  then browse to http://localhost:8080  (login: any username + the dashboard password)

Useful:
  docker compose logs -f curvewatch     # live log
  curl -s localhost:8080/health         # health JSON
  du -sh data/                          # dataset size
For HTTPS on your own domain, see README section 3.5 (Caddy).
EOF
