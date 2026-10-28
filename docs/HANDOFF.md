# Curvewatch handoff (state as of 2026-10-21 deployment; re-verify everything)

## Repo
- GitHub: `jmangelsen/curvewatch`, branch `main`. Treat the repo as public: do not put hosts, key paths, or secrets in new commits.
- Last capital-policy commit on main before the handoff fixes: `331c036` (2026-10-21). This tree's default fingerprint is below.
- Layout: `src/` (index.js, server.js, config.js, db.js, version.js, studio.js, studioWorker.js, codex.js, report.js,
  health.js, drill.js, engine/, edgelab/, sources/), `deploy/` (curvewatch.service, Caddyfile, backup.sh,
  watchdog.sh, hot-static.sh, install-systemd.sh, provision-do.sh, set-helius-key.sh), `scripts/` (tests, backtest,
  selftest, telegram-setup, env-inventory, holder-timeline.py), `public/` (dashboard), `scoring-ui/` (React 19 + Tailwind 3, Vite -> public/scoring).

## Production
- DigitalOcean droplet, systemd `curvewatch`, Caddy `caddy`. Caddy terminates HTTPS and proxies to the app. It does not do basic auth.
- The app binds `127.0.0.1:8080` unless `BIND_HOST` is set. `/health` is unauthenticated. Every other route requires `DASHBOARD_PASSWORD` (constant-time compare, any username). If that variable is unset, those routes are denied unless `CURVEWATCH_ALLOW_UNAUTHENTICATED=1`, which is a local-dev opt-out and must not be set on the VPS. The collector keeps running so the watchdog can still read `/health`.
- DB: `/opt/curvewatch/data/curvewatch.db` (SQLite WAL). Env: `/opt/curvewatch/.env` (root-only, never print).
- Existing watchdog (cron, every 5 min, 3 failed health checks -> restart, max 1 per 30 min) and nightly backup 03:15.
- Last verified 2026-10-21: collector + HTTPS gateway active; final restart 19:20:53 UTC; 120/120 tests;
  4,599 closed paper rows unchanged vs atomic pre-deploy backup; holder collection enabled, 0 errors, 255 mints.
- All Perplexity schedules paused (`0f940ec7-...`, `4648c91d-...`); secondary workspace collector stopped.
  Nothing outside the VPS should be running.

## Current experiment (prospective, unvalidated)
- Default-settings fingerprint of this source tree: `52746d10` (computed with `DATA_DIR=$(mktemp -d)`, not inside `/opt/curvewatch`).
- `4033fed1` is the capital-policy cohort. It ends at the restart that deploys this tree. Do not pool it with `52746d10` or with `96f45eab`.
- Hypothesis 1 rejected/closed. No live trading.
- Capital protection book mirrors every new Main signal (same signal, delay, size, curve state). Entry rule unchanged. This tree does not change that behavior.
- Policy, as the code actually exits (a trigger, not a guaranteed fill):
  - Loss trigger is the book's own stop, capped at 47%. Tighter stops stay tighter. Main's default is 38.5%.
  - Stage 0 (nothing banked): bank 50% of the position when total equity, including cash already banked, reaches 110% of original size.
  - After that first bank (stage ≥ 1) the +2% total-equity floor and the 12%-off-peak trail are armed on the whole remainder, not only the final quarter. If equity falls to ≤ 102% or to ≤ 88% of peak equity before the second bank, the remaining half exits.
  - At stage 1, when total equity reaches 120%, bank another 25% of the original position (half of what remains).
  - The last 25% then exits on that same floor, the same trail, or the shared exits below.
  - A pending partial becomes a full exit only if the loss trigger crosses during the exit delay. The original deadline is kept. The floor and the trail do not convert a pending partial.
  - Shared exits on the capital book as well: graduation (sold at curve close), max hold 60 minutes, idle curve 10 minutes.
  - Graduate books use the same 47% observed-equity ceiling. Long-hold experiment version `61ee0042914f`. Restored open positions wider than 47% are narrowed, with an audit event. Closed rows are not rewritten.
- Unpriced book (pre-registered in `docs/decisions/2026-10-28-unpriced-checkpoint.md`): separate from Main, capital, and `random`. Scores every non-rejected token once at 120s on flow-per-extension and early-buyer VWAP. Control is `unpricedctl` at the same checkpoint. Paper only.
- At handoff: 0 completed prospective paired comparisons.
- Historical audit (604 matched Main trades, descriptive only): baseline mean -15.87%; +10% bank variant -14.69%,
  paired +1.17 pts, ~95% interval -0.14 to +2.49 (crosses zero). Rescued 32 losers, turned 16 winners into losers.
  Losses worse than 47% fell 110 -> 88, not zero. Replay: 1.25% fee, 3% slippage, 2 s delay.

## Open issues
1. Studio heavy reports can still time out on 1 vCPU. Not solved.
2. No dedicated paired-comparison chart; paired confidence sequence only in `/api/paper` (`books.paired.capital`).
3. Production fingerprint stays `4033fed1` until the approved restart onto this tree. Confirm it on `/api/status` after that restart.
4. An observed 47% trigger is not a max-loss guarantee (delay, gaps, failed tx, liquidity).

## Verification endpoints (auth: Basic, password only)
`/api/status` (feeds, fingerprint), `/api/paper` (`books.cfg`, `books.capitalPolicy`, `books.books.capital`,
`books.paired.capital`, stops <= 47), `/api/picks` (holder provider + errors), `/api/studio/late` (long-hold version),
`/api/codex` (capital metadata, live positions, realized cash after partials).

## Release procedure (only with explicit approval)
```bash
# staging (source only, no .env)
cd /root/curvewatch-stage-$(date +%Y%m%d) && env -u HELIUS_API_KEY -u TELEGRAM_BOT_TOKEN npm test
# backup + install
cd /opt/curvewatch
sqlite3 data/curvewatch.db ".timeout 10000" ".backup '/root/curvewatch-pre-$(date +%Y%m%d%H%M).db'"
chmod 600 /root/curvewatch-pre-*.db
# hash closed paper rows from the BACKUP (not a live query) before and after
tar xzf /root/<release>.tgz -C /opt/curvewatch && systemctl restart curvewatch
systemctl is-active curvewatch caddy && curl -fsS http://127.0.0.1:8080/health
journalctl -u curvewatch --since "-3min" --no-pager
```
Rollback: restore previous source files, restart once. Never restore the DB over newer data.

## Decision gate (one PASS, the kill rule)
Do not call any book an edge until `killRule` for that book is PASS on its own fingerprint. PASS means all of:

1. At least 50 closed trades on that fingerprint (gap-flagged rows and enforced-gate rows excluded).
2. The 99% lower bound of mean P&L per trade is above zero.
3. Both halves by exit time are positive, each with at least 10 trades.
4. The book beats its control: the 95% lower bound of the mean difference is above zero, and the control has at least 30 closed trades.

Main and capital use the `random` control. Unpriced uses `unpricedctl`. For capital, that PASS has to land on the `52746d10` cohort (or whatever fingerprint `/api/status` reports after the approved restart), not on `4033fed1`. `books.paired.capital` is a descriptive paired exit comparison with no minimum n. The anytime +2% sequence is the Hypothesis 2 instrument. The 24-hour gate is a separate screen. None of those three is PASS. Even a PASS is paper only; the user decides.
