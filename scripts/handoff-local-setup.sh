#!/usr/bin/env bash
# Local workstation setup for Grok Build. Clones the private repo, runs tests in an env-free tree,
# and reads the fingerprint with a throwaway DATA_DIR. version.js does not open the DB; config.js still reads .env.
set -euo pipefail
DIR=${DIR:-$HOME/curvewatch}
[ -d "$DIR/.git" ] || git clone -b grok-handoff git@github.com:jmangelsen/curvewatch.git "$DIR"
cd "$DIR"
node -v | grep -q '^v20' || echo "WARN: Node 20.x expected, found $(node -v)"
if [ -f .env ]; then echo "ABORT: .env present in $DIR; tests may read it. Move it out."; exit 1; fi
npm ci
env -u HELIUS_API_KEY -u TELEGRAM_BOT_TOKEN npm test
TMP=$(mktemp -d)
DATA_DIR="$TMP" node --input-type=module -e "const { CFG, SETTINGS_ONLY } = await import('./src/version.js'); console.log('fingerprint', CFG, 'settings', SETTINGS_ONLY)"
rm -rf "$TMP"
command -v grok >/dev/null || echo "Install Grok Build: curl -fsSL https://x.ai/cli/install.sh | bash"
echo "Ready. Start with: grok   then paste prompts/00-bootstrap.md"
