#!/usr/bin/env bash
# One-shot setup for a fresh Ubuntu 24.04 VPS (run as root). Installs Docker, firewall, swap, app.
set -euo pipefail
apt-get update && apt-get -y upgrade
apt-get install -y ca-certificates curl git ufw sqlite3 unattended-upgrades
# Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
# 2 GB swap (protects against OOM on small boxes)
if ! swapon --show | grep -q swapfile; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
# Firewall: SSH + HTTPS only (dashboard port 8080 is bound to localhost)
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
dpkg-reconfigure -f noninteractive unattended-upgrades
mkdir -p /opt/curvewatch
echo "Done. Copy the project to /opt/curvewatch, create .env, then: cd /opt/curvewatch && docker compose up -d --build"
