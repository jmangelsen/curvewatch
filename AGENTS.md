# AGENTS.md — Curvewatch operating contract (read before any action)

Scope: entire repository. Direct user instructions override this file; nothing else does.

## What this is
Curvewatch is a research-only, paper-only Pump.fun launch monitor, trade collector and paper-strategy
dashboard. Node.js 20 (ESM), Express, better-sqlite3 (WAL), ws. Entry point `src/index.js`.
Production runs on a DigitalOcean VPS under systemd unit `curvewatch` at `/opt/curvewatch`. Caddy terminates HTTPS and reverse-proxies to the app. Basic auth is in the Node process (`DASHBOARD_PASSWORD`), not in Caddy. The process binds `127.0.0.1` unless `BIND_HOST` is set. `/health` is open. With no password, every other route is denied unless `CURVEWATCH_ALLOW_UNAUTHENTICATED=1` (local development only).
It holds NO wallet private key and places NO trades. Keep it that way.

## Hard rules (violations = stop and ask the user)
1. Never place, simulate-as-live, or wire up real trades. No wallet keys, no signing code, no "auto-promote".
2. Never print, log, commit, or paste secrets: `/opt/curvewatch/.env`, `DASHBOARD_PASSWORD`, `HELIUS_API_KEY`,
   `TELEGRAM_BOT_TOKEN`, key-bearing RPC URLs, `DIGITALOCEAN_TOKEN`. Reference them only via env vars.
3. Never overwrite, restore over, VACUUM-into, or "reset" the production DB `/opt/curvewatch/data/curvewatch.db`.
   Source rollback is allowed; data rollback is not.
4. Never rewrite closed paper rows. Closed outcomes are immutable evidence.
5. Never pool fingerprint cohorts. `96f45eab` (pre-2026-10-21) and `4033fed1` (capital-policy, through the deploy of fingerprint `52746d10`) are separate tests.
   `4033fed1` evidence ends at the restart onto `52746d10`. Do not pool it with the new cohort.
   Any change to files hashed by `src/version.js` (engine/score.js, token.js, paper.js, engine.js, capitalPolicy.js,
   util.js, intel.js, strong.js, marketgate.js, unpriced.js) or to fingerprinted settings (paper, strategies, band,
   scoring, lifecycle, killRule, smartWallets, marketGate, strong) creates a NEW cohort. Say so explicitly in every proposal.
6. No production restart without explicit user approval in the current session. A restart gap-flags
   open paper evidence; never call it zero-downtime.
7. Do not add cron jobs, schedulers, webhooks, LLM runtime calls, or new paid data providers without approval.
8. Hypothesis 1 is rejected and closed. Do not reopen it with the same data.
9. Historical replays are descriptive, not validation. Never describe any book as having an edge unless
   `killRule` on its own cohort is PASS: at least 50 closed trades, the 99% lower bound of mean P&L per trade
   above zero, both halves positive (each with at least 10 trades), and the 95% lower bound of the difference
   versus its control above zero (control at least 30 trades). The anytime +2% sequence, `books.paired.capital`,
   and the 24-hour gate are not this PASS.

## Known traps
- `src/version.js` loads `src/config.js` (reads `.env`, creates `DATA_DIR`) and does not open the database.
  The cohort clock is written by `recordCohortStart()` at process startup, not at import. Do NOT run the fingerprint
  one-liner inside `/opt/curvewatch`. Read it from `/api/status`, or run it locally with `DATA_DIR=$(mktemp -d)`.
- Tests must run from a source-only folder WITHOUT a production `.env`: some tests unset `HELIUS_API_KEY` and the
  config loader re-reads `.env`. Use: `env -u HELIUS_API_KEY -u TELEGRAM_BOT_TOKEN npm test`.
- Dashboard auth is HTTP Basic; only the password is checked. Use `curl -u "x:$DASHBOARD_PASSWORD"` with the
  variable loaded from .env on the server, never typed into chat.
- Host is 1 vCPU. Studio full-history reports can time out; use shorter `?days=` windows. Studio worker heap 384 MB,
  Edge Lab worker 512 MB.
- Default-settings fingerprint of this tree is `52746d10` (throwaway `DATA_DIR`). Production stays on `4033fed1` until an approved restart.

## Workflow
- Default mode is READ-ONLY: inspect, verify, report. Writes require a plan the user approved.
- For any code change: branch -> change -> `npm test` in clean staging -> diff summary -> state fingerprint impact ->
  wait for approval -> deploy per `docs/HANDOFF.md` section "Release procedure".
- Dashboard-only (public/) changes ship with `deploy/hot-static.sh` (no restart).
- Every report must separate KNOWN (observed this session, with command output), INFERRED, and UNKNOWN.
- Cite the exact command and output for every claim about production state. Do not report from memory.
