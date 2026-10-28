# Curvewatch handoff (state as of 2026-10-21 deployment; re-verify everything)

## Repo
- GitHub: `jmangelsen/curvewatch` (private), branch `main`.
- Last commit: `331c036` "Add versioned capital-protection paper challenger and 47% trigger ceiling; bound research workers" (2026-10-21 19:22 UTC).
- Layout: `src/` (index.js, server.js, config.js, db.js, version.js, studio.js, studioWorker.js, codex.js, report.js,
  health.js, drill.js, engine/, edgelab/, sources/), `deploy/` (curvewatch.service, Caddyfile, backup.sh,
  watchdog.sh, hot-static.sh, install-systemd.sh, provision-do.sh, set-helius-key.sh), `scripts/` (tests, backtest,
  selftest, telegram-setup, env-inventory, holder-timeline.py), `public/` (dashboard), `scoring-ui/` (React 19 + Tailwind 3, Vite -> public/scoring).

## Production
- DigitalOcean droplet, systemd `curvewatch`, Caddy `caddy`, app on 127.0.0.1:8080, `/health` unauthenticated.
- DB: `/opt/curvewatch/data/curvewatch.db` (SQLite WAL). Env: `/opt/curvewatch/.env` (root-only, never print).
- Existing watchdog (cron, every 5 min, 3 failed health checks -> restart, max 1 per 30 min) and nightly backup 03:15.
- Last verified 2026-10-21: collector + HTTPS gateway active; final restart 19:20:53 UTC; 120/120 tests;
  4,599 closed paper rows unchanged vs atomic pre-deploy backup; holder collection enabled, 0 errors, 255 mints.
- All Perplexity schedules paused (`0f940ec7-...`, `4648c91d-...`); secondary workspace collector stopped.
  Nothing outside the VPS should be running.

## Current experiment (prospective, unvalidated)
- New cohort fingerprint `4033fed1`. Old `96f45eab` stays separate. Hypothesis 1 rejected/closed. No live trading.
- Capital protection book mirrors every new Main signal (same signal, delay, size, curve state). Entry rule unchanged.
- Policy: loss trigger <= 47% (keep tighter stops, Main = 38.5%); bank 50% of original at 110% total equity;
  bank another 25% of original at 120%; final 25% exits at 102% floor or 12% off peak equity; pending partial
  converts to full exit if loss trigger crosses, keeping execution deadline. Graduate books: 47% observed-equity ceiling.
  Long-hold experiment version `61ee0042914f`. Restored older positions narrowed to <= 47% with audit event.
- At handoff: 0 completed prospective paired comparisons.
- Historical audit (604 matched Main trades, descriptive only): baseline mean -15.87%; +10% bank variant -14.69%,
  paired +1.17 pts, ~95% interval -0.14 to +2.49 (crosses zero). Rescued 32 losers, turned 16 winners into losers.
  Losses worse than 47% fell 110 -> 88, not zero. Replay: 1.25% fee, 3% slippage, 2 s delay.

## Open issues
1. Studio heavy reports can still time out on 1 vCPU. Not solved.
2. No dedicated paired-comparison chart; paired confidence sequence only in `/api/paper` (`books.paired.capital`).
3. README header fingerprint is stale.
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

## Decision gate for the capital book
Do not call it better until the prospective paired interval in `books.paired.capital` excludes zero on the
`4033fed1` cohort with enough pairs (kill rule minimum 50 closed). Even then: paper only, user decides.
