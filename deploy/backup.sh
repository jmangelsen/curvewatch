#!/usr/bin/env bash
# Nightly online backup of the SQLite dataset (safe while running). Keeps 14 days.
# crontab -e  ->  15 3 * * * /opt/curvewatch/deploy/backup.sh >> /var/log/curvewatch-backup.log 2>&1
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB="$DIR/data/curvewatch.db"
OUT="$DIR/backups"; mkdir -p "$OUT"
STAMP=$(date +%Y%m%d-%H%M)
sqlite3 "$DB" ".backup '$OUT/curvewatch-$STAMP.db'"
gzip -f "$OUT/curvewatch-$STAMP.db"
find "$OUT" -name 'curvewatch-*.db.gz' -mtime +14 -delete
echo "$(date -Is) backup ok: $OUT/curvewatch-$STAMP.db.gz ($(du -h "$OUT/curvewatch-$STAMP.db.gz" | cut -f1))"
