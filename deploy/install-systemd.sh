#!/usr/bin/env bash
# Curvewatch native install (no Docker) for a fresh Ubuntu 24.04 / Debian 12 VPS. Run as root with the project at /opt/curvewatch:
#
#   apt-get update && apt-get install -y unzip && mkdir -p /opt && cd /opt \
#     && unzip -o ~/curvewatch.zip && cd curvewatch && bash deploy/install-systemd.sh
#
# What it does, idempotently (safe to re-run after `git pull` or a new zip):
#   1. Node 20 (NodeSource), sqlite3, build tools, ufw firewall (SSH + 80/443 only), 2 GB swap, unattended security updates
#   2. A locked-down `curvewatch` system user owning /opt/curvewatch; data/ and backups/ are the only writable paths
#   3. .env from deploy/env.production with a random dashboard password (never overwrites an existing .env)
#   4. npm ci --omit=dev, npm test
#   5. systemd unit (deploy/curvewatch.service), enabled and started, with journald logging
#   6. cron: nightly verified SQLite backup at 03:15 (14 kept), weekly `VACUUM` Sunday 04:30, watchdog every 5 min (restarts a hung feed)
set -euo pipefail
cd "$(dirname "$0")/.."
APP="$(pwd)"
[ "$APP" = "/opt/curvewatch" ] || { echo "Expected the project at /opt/curvewatch (unit file and env paths assume it). Found: $APP"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "Run as root."; exit 1; }
say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

say "1/6 System packages, Node 20, firewall, swap, security updates"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq ca-certificates curl git ufw sqlite3 unattended-upgrades build-essential python3 >/dev/null
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null && apt-get install -y -qq nodejs >/dev/null
fi
echo "node $(node -v), npm $(npm -v)"
if ! swapon --show | grep -q swapfile; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab && echo "2 GB swap enabled"; fi
ufw allow OpenSSH >/dev/null && ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && ufw --force enable >/dev/null && echo "firewall: 22, 80, 443 open; 8080 stays local (use the SSH tunnel or Caddy)"
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true

say "2/6 Service user and permissions"
id curvewatch >/dev/null 2>&1 || useradd --system --home /opt/curvewatch --shell /usr/sbin/nologin curvewatch
mkdir -p data backups
chown -R curvewatch:curvewatch "$APP"
chmod 750 "$APP" && chmod 770 data backups

say "3/6 Configuration (.env)"
if [ ! -f .env ]; then
  cp deploy/env.production .env
  PW="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-28)"
  sed -i "s|^DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=${PW}|" .env
  echo "Created .env. Dashboard password (any username): ${PW}"
  echo "It is stored in ${APP}/.env; save it now."
  read -r -p "Telegram bot token (Enter to skip; add later in .env): " TG || true
  if [ -n "${TG:-}" ]; then
    sed -i "s|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=${TG}|" .env
    echo "Open your bot in Telegram, send /start, then press Enter."; read -r _ || true
    CHAT="$(curl -fsS "https://api.telegram.org/bot${TG}/getUpdates" | grep -o '"chat":{"id":-\?[0-9]*' | head -1 | grep -o -- '-\?[0-9]*$' || true)"
    if [ -n "$CHAT" ]; then sed -i "s|^TELEGRAM_CHAT_ID=.*|TELEGRAM_CHAT_ID=${CHAT}|" .env; echo "chat_id ${CHAT} saved."; else echo "No chat found yet; set TELEGRAM_CHAT_ID in .env later."; fi
  fi
  read -r -p "healthchecks.io ping URL (Enter to skip): " HC || true
  [ -n "${HC:-}" ] && sed -i "s|^HEALTHCHECK_URL=.*|HEALTHCHECK_URL=${HC}|" .env
  read -r -p "Paid RPC websocket URL, e.g. Helius (Enter to keep the public endpoint): " RPC || true
  [ -n "${RPC:-}" ] && sed -i "s|^RPC_WS_URLS=.*|RPC_WS_URLS=${RPC},wss://api.mainnet-beta.solana.com|" .env
else
  echo ".env exists, leaving it unchanged."
fi
chown curvewatch:curvewatch .env && chmod 640 .env

say "4/6 Dependencies and tests"
sudo -u curvewatch -H bash -c "cd '$APP' && npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -2"
sudo -u curvewatch -H bash -c "cd '$APP' && DATA_DIR=/tmp/cw-test-\$\$ npm test 2>&1 | grep -E 'tests passed|Error|FAIL' || true"

say "5/6 systemd unit"
install -m 644 deploy/curvewatch.service /etc/systemd/system/curvewatch.service
systemctl daemon-reload
systemctl enable --now curvewatch >/dev/null
for i in $(seq 1 30); do
  if curl -fsS localhost:8080/health >/dev/null 2>&1; then echo "healthy: $(curl -fsS localhost:8080/health | cut -c1-200)"; break; fi
  sleep 2; [ "$i" = 30 ] && { echo "Not healthy after 60 s. Last log lines:"; journalctl -u curvewatch -n 60 --no-pager; exit 1; }
done

say "6/6 Cron: nightly verified backup, weekly VACUUM, 5-minute watchdog"
chmod +x deploy/backup.sh
( { crontab -l 2>/dev/null || true; } | { grep -v '# curvewatch' || true; } ; \
  echo "15 3 * * * ${APP}/deploy/backup.sh >> /var/log/curvewatch-backup.log 2>&1 # curvewatch"; \
  echo "30 4 * * 0 sqlite3 ${APP}/data/curvewatch.db 'PRAGMA wal_checkpoint(TRUNCATE); VACUUM;' >> /var/log/curvewatch-backup.log 2>&1 # curvewatch"; \
  echo "*/5 * * * * APP=${APP} ${APP}/deploy/watchdog.sh # curvewatch" ) | crontab -
chmod +x deploy/watchdog.sh
touch /var/log/curvewatch-backup.log
crontab -l | grep '# curvewatch'
# first backup now, so the Health tab shows a fresh one and the script is proven on this box
"${APP}/deploy/backup.sh" | tail -1

IP="$(curl -fsS -4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
cat <<EOF

Curvewatch is collecting 24/7. systemd restarts it on crash and on reboot.

Dashboard (nothing is exposed publicly; tunnel from your computer):
  ssh -L 8080:localhost:8080 root@${IP}     then open http://localhost:8080  (any username + the dashboard password)

Operate:
  systemctl status curvewatch            journalctl -u curvewatch -f          # status, live log
  systemctl restart curvewatch           # after editing .env
  tail -3 /var/log/curvewatch-backup.log  ls -lh ${APP}/backups               # backups
  du -sh ${APP}/data                      # dataset size (plan ~6-9 GB per 30 retained days)

Update to a new version:
  cd ${APP} && unzip -o ~/curvewatch.zip -d /opt && chown -R curvewatch:curvewatch . && bash deploy/install-systemd.sh

Restore a backup:
  systemctl stop curvewatch && gunzip -c backups/curvewatch-YYYYMMDD-HHMM.db.gz > data/curvewatch.db && chown curvewatch: data/curvewatch.db && systemctl start curvewatch

HTTPS on your own domain instead of the tunnel: see deploy/Caddyfile and README section 3.5.
EOF
