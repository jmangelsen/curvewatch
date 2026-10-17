#!/usr/bin/env bash
# Provision a DigitalOcean Droplet for Curvewatch end to end: SSH key, Droplet, wait for boot, upload the code and
# a prepared .env, run deploy/install-systemd.sh, verify /health. Idempotent: re-running reuses an existing key and a
# Droplet with the same name.
#
# Auth: either export DIGITALOCEAN_TOKEN, or run under a credential proxy that injects the Authorization header
# (then leave DIGITALOCEAN_TOKEN unset; the script sends no header of its own).
#
# Usage:
#   ZIP=../curvewatch.zip ENV_FILE=/path/to/prepared.env SSH_KEY=~/.ssh/curvewatch_deploy bash deploy/provision-do.sh
#
# Optional env: DO_NAME (curvewatch-1), DO_REGION (sfo3), DO_SIZE (s-1vcpu-2gb), DO_IMAGE (ubuntu-24-04-x64),
#               EXTRA_PUBKEY (a second public key, e.g. the owner's Windows key, appended to root's authorized_keys)
set -euo pipefail
API=https://api.digitalocean.com/v2
DO_NAME="${DO_NAME:-curvewatch-1}"; DO_REGION="${DO_REGION:-sfo3}"; DO_SIZE="${DO_SIZE:-s-1vcpu-2gb}"; DO_IMAGE="${DO_IMAGE:-ubuntu-24-04-x64}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/curvewatch_deploy}"; ZIP="${ZIP:-curvewatch.zip}"; ENV_FILE="${ENV_FILE:-}"
[ -f "$SSH_KEY" ] && [ -f "$SSH_KEY.pub" ] || { echo "SSH key pair not found at $SSH_KEY(.pub)"; exit 1; }
[ -f "$ZIP" ] || { echo "Zip not found: $ZIP"; exit 1; }
[ -z "$ENV_FILE" ] || [ -f "$ENV_FILE" ] || { echo "ENV_FILE not found: $ENV_FILE"; exit 1; }
say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
api() { # method path [json]
  local m="$1" p="$2" d="${3:-}"; local -a H=(-H 'Content-Type: application/json')
  [ -n "${DIGITALOCEAN_TOKEN:-}" ] && H+=(-H "Authorization: Bearer $DIGITALOCEAN_TOKEN")
  if [ -n "$d" ]; then curl -fsS -X "$m" "${H[@]}" -d "$d" "$API$p"; else curl -fsS -X "$m" "${H[@]}" "$API$p"; fi
}
jq_() { python3 -c "import json,sys; d=json.load(sys.stdin); print(eval(sys.argv[1]))" "$1"; }

say "1/6 Account and SSH key"
api GET /account | jq_ "d['account']['email'] + ' · status ' + d['account']['status'] + ' · droplet limit ' + str(d['account']['droplet_limit'])"
FP="$(ssh-keygen -lf "$SSH_KEY.pub" -E md5 | awk '{print $2}' | sed 's/^MD5://')"
KEY_ID="$(api GET "/account/keys?per_page=200" | jq_ "next((str(k['id']) for k in d['ssh_keys'] if k['fingerprint']=='$FP'), '')")"
if [ -z "$KEY_ID" ]; then
  PUB="$(cat "$SSH_KEY.pub")"
  KEY_ID="$(api POST /account/keys "{\"name\":\"curvewatch-deploy\",\"public_key\":\"$PUB\"}" | jq_ "str(d['ssh_key']['id'])")"
  echo "uploaded deploy key id $KEY_ID"
else echo "deploy key already on the account (id $KEY_ID)"; fi

say "2/6 Droplet $DO_NAME ($DO_SIZE, $DO_IMAGE, $DO_REGION)"
DID="$(api GET "/droplets?per_page=200" | jq_ "next((str(x['id']) for x in d['droplets'] if x['name']=='$DO_NAME'), '')")"
if [ -z "$DID" ]; then
  USER_DATA='#cloud-config\npackage_update: true\npackages: [unzip, curl]\nruncmd:\n  - mkdir -p /opt\n'
  BODY="$(python3 - "$DO_NAME" "$DO_REGION" "$DO_SIZE" "$DO_IMAGE" "$KEY_ID" "$USER_DATA" <<'EOF'
import json, sys
n, r, s, i, k, u = sys.argv[1:7]
print(json.dumps({"name": n, "region": r, "size": s, "image": i, "ssh_keys": [int(k)], "monitoring": True, "ipv6": False,
                  "tags": ["curvewatch"], "user_data": u.encode().decode('unicode_escape')}))
EOF
)"
  DID="$(api POST /droplets "$BODY" | jq_ "str(d['droplet']['id'])")"
  echo "created droplet id $DID"
else echo "droplet already exists (id $DID)"; fi

say "3/6 Waiting for the Droplet to become active"
IP=""
for i in $(seq 1 60); do
  J="$(api GET "/droplets/$DID")"
  ST="$(echo "$J" | jq_ "d['droplet']['status']")"
  IP="$(echo "$J" | jq_ "next((n['ip_address'] for n in d['droplet']['networks']['v4'] if n['type']=='public'), '')")"
  [ "$ST" = active ] && [ -n "$IP" ] && break
  sleep 5
done
[ -n "$IP" ] || { echo "no public IP after 5 minutes"; exit 1; }
echo "droplet $DID is $ST at $IP"
SSH=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o BatchMode=yes "root@$IP")
for i in $(seq 1 40); do "${SSH[@]}" true 2>/dev/null && break; sleep 5; [ "$i" = 40 ] && { echo "SSH never came up"; exit 1; }; done
echo "ssh ready"
# cloud-init may still be installing packages; wait for it so apt is not locked
"${SSH[@]}" 'cloud-init status --wait >/dev/null 2>&1 || true'

say "4/6 Uploading code and configuration"
scp -q -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$ZIP" "root@$IP:/root/curvewatch.zip"
"${SSH[@]}" 'apt-get install -y -qq unzip >/dev/null 2>&1 || true; mkdir -p /opt && cd /opt && rm -rf curvewatch.new && mkdir curvewatch.new && unzip -oq /root/curvewatch.zip -d curvewatch.new && if [ -d curvewatch ]; then rsync -a --exclude data --exclude backups --exclude .env curvewatch.new/curvewatch/ curvewatch/ 2>/dev/null || cp -rn curvewatch.new/curvewatch/. curvewatch/; else mv curvewatch.new/curvewatch curvewatch; fi; rm -rf curvewatch.new'
if [ -n "$ENV_FILE" ]; then
  scp -q -i "$SSH_KEY" "$ENV_FILE" "root@$IP:/opt/curvewatch/.env"
  "${SSH[@]}" 'chmod 640 /opt/curvewatch/.env'
  echo "placed .env (install script will leave it unchanged, so no interactive prompts)"
fi
if [ -n "${EXTRA_PUBKEY:-}" ]; then "${SSH[@]}" "grep -qxF '$EXTRA_PUBKEY' ~/.ssh/authorized_keys || echo '$EXTRA_PUBKEY' >> ~/.ssh/authorized_keys"; echo "added owner's public key"; fi

say "5/6 Installing (Node 20, service user, systemd, firewall, swap, backups, watchdog)"
"${SSH[@]}" 'cd /opt/curvewatch && bash deploy/install-systemd.sh' </dev/null

say "6/6 Verification"
"${SSH[@]}" 'systemctl is-active curvewatch; curl -fsS localhost:8080/health | cut -c1-240; echo; free -m | head -2; df -h / | tail -1'
cat <<EOT

Done. Droplet $DO_NAME ($IP).
  Dashboard (from your PC):  ssh -i <your key> -L 8080:localhost:8080 root@$IP   then open http://localhost:8080
  Logs:                      ssh root@$IP journalctl -u curvewatch -f
  Update code:               re-run this script with a new zip (data, backups and .env are preserved)
EOT
