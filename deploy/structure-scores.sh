#!/usr/bin/env bash
# Daily trade-structure scoring -> public/structure/data (served behind the dashboard password).
# Read-only on the database; no collector restart. Usage:
#   deploy/structure-scores.sh              # previous UTC day
#   deploy/structure-scores.sh 2026-10-20   # a specific UTC day
# Env: APP (default /opt/curvewatch), DB, WINDOW_SEC (default 3600), KEEP_DAYS (default 90)
set -euo pipefail
APP="${APP:-/opt/curvewatch}"; DB="${DB:-$APP/data/curvewatch.db}"
WINDOW_SEC="${WINDOW_SEC:-3600}"; KEEP_DAYS="${KEEP_DAYS:-90}"
DAY="${1:-$(date -u -d yesterday +%F)}"
OUT="$APP/public/structure/data"; mkdir -p "$OUT"
SINCE=$(date -u -d "$DAY 00:00" +%s); UNTIL=$(( SINCE + 86400 ))
# Coins launched during DAY need WINDOW_SEC more tape after midnight to finish their window.
nice -n 10 python3 "$APP/analysis/curvewatch_scoring.py" --db "$DB" \
  --since "$SINCE" --until $(( UNTIL + WINDOW_SEC )) --window-sec "$WINDOW_SEC" \
  --launched-since "$SINCE" --launched-until "$UNTIL" \
  --out "$OUT/scores-$DAY.json"
cp "$OUT/scores-$DAY.json" "$OUT/latest.json.tmp" && mv "$OUT/latest.json.tmp" "$OUT/latest.json"
find "$OUT" -name 'scores-*.json' -mtime +"$KEEP_DAYS" -delete
python3 - "$OUT" <<'PY'
import json, os, sys, glob
out = sys.argv[1]; files = []
for p in sorted(glob.glob(os.path.join(out, "scores-*.json"))):
    try:
        with open(p) as fh: m = json.load(fh)
    except Exception: continue
    files.append({"date": os.path.basename(p)[7:17], "file": os.path.basename(p),
                  "n_coins": m["cohort"]["n_coins"], "n_ranked": m["cohort"]["n_ranked"],
                  "fingerprint": m["params_fingerprint"]})
idx = {"files": files, "latest": files[-1]["file"] if files else "latest.json"}
tmp = os.path.join(out, "index.json.tmp")
with open(tmp, "w") as fh: json.dump(idx, fh)
os.replace(tmp, os.path.join(out, "index.json"))
PY
chown -R curvewatch:curvewatch "$OUT" 2>/dev/null || true
echo "$(date -u +%FT%TZ) structure scores $DAY -> $OUT/scores-$DAY.json"
