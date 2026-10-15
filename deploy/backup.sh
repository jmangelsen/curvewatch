#!/usr/bin/env bash
# Nightly online backup of the SQLite dataset. Safe while the collector is running (uses SQLite's .backup API).
# Verifies the copy, compresses it, keeps 14 daily copies, and optionally ships it off-box with rclone.
#
#   crontab (installed by deploy/install-systemd.sh):
#   15 3 * * * /opt/curvewatch/deploy/backup.sh >> /var/log/curvewatch-backup.log 2>&1
#
# Env (read from /opt/curvewatch/.env when present): DATA_DIR, BACKUP_DIR, BACKUP_KEEP_DAYS, BACKUP_RCLONE_REMOTE, HEALTHCHECK_URL
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$DIR/.env" ] && set -a && . "$DIR/.env" && set +a
DB="${DATA_DIR:-$DIR/data}/curvewatch.db"
OUT="${BACKUP_DIR:-$DIR/backups}"; KEEP="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$OUT"
STAMP=$(date +%Y%m%d-%H%M); TMP="$OUT/curvewatch-$STAMP.db"
[ -f "$DB" ] || { echo "$(date -Is) ERROR: database not found at $DB"; exit 1; }
sqlite3 "$DB" ".backup '$TMP'"
# verify before trusting it
CHECK=$(sqlite3 "$TMP" 'PRAGMA integrity_check;' | head -1)
if [ "$CHECK" != "ok" ]; then echo "$(date -Is) ERROR: integrity check failed on $TMP: $CHECK"; rm -f "$TMP"; exit 1; fi
ROWS=$(sqlite3 "$TMP" 'SELECT (SELECT COUNT(*) FROM tokens) || " tokens, " || (SELECT COUNT(*) FROM snapshots) || " snapshots, " || (SELECT COUNT(*) FROM grad_snapshots) || " grad snapshots";')
gzip -f "$TMP"
find "$OUT" -name 'curvewatch-*.db.gz' -mtime +"$KEEP" -delete
SIZE=$(du -h "$TMP.gz" | cut -f1)
echo "$(date -Is) backup ok: $TMP.gz ($SIZE; $ROWS)"
# optional off-box copy, e.g. BACKUP_RCLONE_REMOTE=b2:curvewatch-backups  (configure with `rclone config` as root)
if [ -n "${BACKUP_RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$TMP.gz" "$BACKUP_RCLONE_REMOTE" --quiet && echo "$(date -Is) offsite copy ok -> $BACKUP_RCLONE_REMOTE"
fi
# tell the dead-man switch the backup ran (same check as the collector, /backup sub-slug keeps it separate if you make one)
[ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 --retry 3 "${HEALTHCHECK_URL%/}/backup" >/dev/null 2>&1 || true
exit 0
