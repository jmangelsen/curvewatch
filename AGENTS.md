# AGENTS.md — Curvewatch operating contract (read before any action)

Scope: entire repository. Direct user instructions override this file; nothing else does.

## What this is
Curvewatch is a research-only, paper-only Pump.fun launch monitor, trade collector and paper-strategy
dashboard. Node.js 20 (ESM), Express, better-sqlite3 (WAL), ws. Entry point `src/index.js`.
Production runs on a DigitalOcean VPS under systemd unit `curvewatch` at `/opt/curvewatch`, behind Caddy (HTTPS + basic auth).
It holds NO wallet private key and places NO trades. Keep it that way.

## Hard rules (violations = stop and ask the user)
1. Never place, simulate-as-live, or wire up real trades. No wallet keys, no signing code, no "auto-promote".
2. Never print, log, commit, or paste secrets: `/opt/curvewatch/.env`, `DASHBOARD_PASSWORD`, `HELIUS_API_KEY`,
   `TELEGRAM_BOT_TOKEN`, key-bearing RPC URLs, `DIGITALOCEAN_TOKEN`. Reference them only via env vars.
3. Never overwrite, restore over, VACUUM-into, or "reset" the production DB `/opt/curvewatch/data/curvewatch.db`.
   Source rollback is allowed; data rollback is not.
4. Never rewrite closed paper rows. Closed outcomes are immutable evidence.
5. Never pool fingerprint cohorts. `96f45eab` (pre-2026-10-21) and `4033fed1` (post capital-policy) are separate tests.
   Any change to files hashed by `src/version.js` (engine/score.js, token.js, paper.js, engine.js, capitalPolicy.js)
   or to fingerprinted settings creates a NEW cohort. Say so explicitly in every proposal.
6. No production restart without explicit user approval in the current session. A restart gap-flags
   open paper evidence; never call it zero-downtime.
7. Do not add cron jobs, schedulers, webhooks, LLM runtime calls, or new paid data providers without approval.
8. Hypothesis 1 is rejected and closed. Do not reopen it with the same data.
9. Historical replays are descriptive, not validation. Never describe any book as having an edge unless the
   prospective kill rule says PASS (95% interval entirely above zero) on its own cohort.

## Known traps
- `src/version.js` imports `src/db.js`, which opens the DB, runs migrations and writes a `cfg_since:<fp>` kv row.
  Do NOT run the README fingerprint one-liner inside `/opt/curvewatch`. Read the fingerprint from `/api/status`,
  or run it locally with `DATA_DIR=$(mktemp -d)`.
- Tests must run from a source-only folder WITHOUT a production `.env`: some tests unset `HELIUS_API_KEY` and the
  config loader re-reads `.env`. Use: `env -u HELIUS_API_KEY -u TELEGRAM_BOT_TOKEN npm test` (expect 120 passing).
- Dashboard auth is HTTP Basic; only the password is checked. Use `curl -u "x:$DASHBOARD_PASSWORD"` with the
  variable loaded from .env on the server, never typed into chat.
- Host is 1 vCPU. Studio full-history reports can time out; use shorter `?days=` windows. Studio worker heap 384 MB,
  Edge Lab worker 512 MB.
- README header still says fingerprint `96f45eab`; that is stale for the curve books after 2026-10-21.

## Workflow
- Default mode is READ-ONLY: inspect, verify, report. Writes require a plan the user approved.
- For any code change: branch -> change -> `npm test` in clean staging -> diff summary -> state fingerprint impact ->
  wait for approval -> deploy per `docs/HANDOFF.md` section "Release procedure".
- Dashboard-only (public/) changes ship with `deploy/hot-static.sh` (no restart).
- Every report must separate KNOWN (observed this session, with command output), INFERRED, and UNKNOWN.
- Cite the exact command and output for every claim about production state. Do not report from memory.
