# Curvewatch capital protection audit and deployment

Deployment verified on 2026-10-21. The VPS collector and HTTPS gateway are active; status, paper results, picks, late accumulation, Codex and scoring endpoints responded successfully. All 120 tests passed locally and in source-only VPS staging. All 4,599 closed paper rows in the atomic pre-deployment backup are unchanged. The final collector restart was at 19:20:53 UTC, after the initial policy deployment restart at 19:01:40 UTC.

The new Capital protection book has zero completed prospective paired comparisons at this verification point. Holder collection is enabled with zero reported errors and 255 counted mints. No new Perplexity automation or workspace collector is running. Heavy full-history Studio reports are not part of the successful endpoint claim; they remain bounded on-demand work and may need a shorter date window on this host.

## Decision

The user authorized earlier scale-outs and a maximum loss-trigger distance of 47% on 2026-10-21. This supersedes the earlier fingerprint freeze for this specific exit-policy change. Old closed records remain unchanged. The capital-policy cohort is fingerprint `4033fed1`; the original `96f45eab` cohort must not be pooled with it. The 2026-10-28 source tree moves the default fingerprint to `52746d10` without changing this exit policy. `4033fed1` evidence ends at the restart onto that tree and must not be pooled with it either. Hypothesis 1 remains rejected and closed. There is no live trading.

The change is risk-control infrastructure plus a prospective challenger, not a validated positive trading edge. The entry-selection rule is unchanged. New Main signals are mirrored into the independent Capital protection paper book with the same signal, delay, size, and curve state. The experiment uses no additional market-data provider and no LLM or Perplexity runtime call.

Rollout also exposed an existing Edge Lab worker out-of-memory failure. Sparse numeric checkpoint objects are replaced by dense arrays, and retrospective replay now processes one trade tape at a time instead of retaining up to 2,500 full tapes simultaneously. The calculation rules are unchanged, with unit tests covering missing, zero, overwritten and horizon-specific labels plus replay order and returns. A read-only full-worker check against production data completed all 98 tests and replayed 2,339 usable tapes under a 512 MB heap limit in about 35 seconds; these tapes include duplicate entries across books and are not an independent performance sample. Because each Edge Lab run starts a fresh worker, these worker files can be updated without another collector restart.

Studio used the same sparse numeric pattern. Its checkpoint maps now use compact Map storage, and raw source rows are streamed where possible. Repeated automatic full-history warm-ups are removed: Studio is computed only when requested. Its worker is bounded to a 384 MB heap and terminated on a request deadline, with a smaller-window retry message. Very large reports can still time out on the 1-vCPU server; this is not presented as fully solved query performance. A second collector restart is needed to unload the old Studio worker and load this lifecycle fix.

## What the records show

The read-only audit selected 608 closed Main trades from the `96f45eab` cohort with no gap flag and no gated-entry flag. Of these, 604 had usable historical reserve tape and matched a replay of the original exit to within five return percentage points; one lacked usable tape and three did not reproduce closely enough. These are unique Main entries, not the same coin counted repeatedly across strategy books.

Within those 604 matched entries:

- 146 were positive at some point but ultimately lost money.
- 71 reached at least +10% net liquidation value before losing money.
- 110 realized losses worse than 47%, even though their original stop trigger was tighter, at 38.5%.
- Mean actual return was -15.87%. Mean reproduced baseline return was -15.86%; differences are not silently treated as zero.

Historical overlay results:

| First bank | Mean simulated return | Paired improvement over reproduced baseline | Approximate 95% interval for improvement |
|---|---:|---:|---:|
| 50% at +10% net equity | -14.69% | +1.17 percentage points | -0.14 to +2.49 |
| 50% at +15% net equity | -15.48% | +0.38 percentage points | -0.66 to +1.43 |
| 50% at +20% net equity | -15.87% | -0.01 percentage points | -0.66 to +0.65 |

The +10% version rescued 32 actual losers but turned 16 actual winners into losers. Losses after a +10% peak fell from 71 to 55 in this matched subset. Losses worse than 47% fell from 110 to 88, not zero.

These are descriptive historical comparisons. Intervals are ordinary mean-difference intervals, not anytime-valid confidence sequences, not adjusted for trying multiple variants, and not proof of generalizable edge. The chronological halves are diagnostics after dataset inspection, not untouched holdouts.

The replay uses recorded reserves, 1.25% fee, 3% slippage haircut and a two-second reaction delay. It closes any remaining tokens at the original Main exit time, so it does not measure the benefit or cost of keeping a runner beyond that time. Retained tape is not a complete order book, and inclusion by replay match can bias the sample. Future performance remains unverified.

## Operational policy

- **Curve loss triggers:** At most 47%. Preserve tighter stops, including Main's configured 38.5%. The formerly unstopped timed book now has a 47% loss trigger.
- **Capital first bank:** Sell half the original tokens when executable total equity reaches 110% of initial cost.
- **Capital second bank:** At 120% total equity, sell half the remaining tokens, equivalent to another quarter of the original units.
- **Remainder:** Keep a quarter of the original units. After the first filled partial, trigger an exit if total equity falls to 102% of initial cost or 12% below peak total equity. Existing graduation, stale-feed and maximum-hold handling still applies.
- **Pending partial during a dump:** Convert it into a full-exit order if the loss trigger is crossed. Keep the existing execution deadline; do not fabricate an instantaneous fill.
- **Graduate books:** Explicit observed-equity ceiling at 47%; existing tighter stops remain. The hard ceiling also applies after a trailing book is armed.
- **Long-hold experiment:** Add an observed net-equity ceiling at 47% alongside the tighter existing price stop. The isolated long-hold version changes to `61ee0042914f`.
- **Older open positions:** On restoration, narrow any stop wider than 47% and add an audit event. Existing restart/gap exclusion rules apply. Do not rewrite closed outcomes.

An observed trigger is not a guaranteed maximum realized loss. Reaction delay, discontinuous price moves, transaction failure and liquidity loss can produce a worse fill. The simulator must record that worse fill honestly. Tightening a trigger cannot eliminate this market risk.

## Independent operation

Both Perplexity schedules for this conversation are paused:

- `0f940ec7-fb37-4e0e-8d61-9600719fbced`: 12-hour VPS research check.
- `4648c91d-d53d-464b-84e1-10a8d4e9bb04`: older 24-hour gate report.

The secondary workspace collector is stopped. The DigitalOcean collector, HTTPS gateway, existing watchdog and backups remain independent. No replacement Perplexity schedule or server-side messaging job was created. The current requested engineering session is still interactive Computer work; pausing schedules does not make that work credit-free. DigitalOcean and Helius usage are separate from Perplexity.

## Deployment Blueprint

### Dependencies and configuration

Node.js 20.x and the existing root package dependencies. No new package, API key, environment variable, credential, public endpoint or firewall rule is needed. Preserve `/opt/curvewatch/.env` and the live database. The public Perplexity-hosted copy is not republished.

### Test in a clean staging folder

Tests must not run from a folder containing the production `.env`: some tests deliberately remove `HELIUS_API_KEY`, causing the config loader to reload it from that file. Use a source-only staging folder with a symlink to the already installed root `node_modules`.

```bash
cd /root/curvewatch-capital-stage-20261021
env -u HELIUS_API_KEY -u TELEGRAM_BOT_TOKEN npm test
```

Expected: 120 tests pass. The focused exit-policy tests are also runnable with:

```bash
node scripts/test-capital.js
```

### Preserve data and install

The release procedure backs up the database through SQLite's backup API, saves the pre-change `/api/paper` result privately, saves the replaced source files, and records hashes of existing closed paper rows. Only the changed source/test/documentation files are installed. No destructive migration is required.

```bash
cd /opt/curvewatch
sqlite3 data/curvewatch.db ".timeout 10000" \
  ".backup '/root/curvewatch-pre-capital-20261021.db'"
tar xzf /root/curvewatch-capital-v1-update.tgz -C /opt/curvewatch
systemctl restart curvewatch
systemctl is-active curvewatch caddy
```

Protect root-only backups with mode 600. A restart briefly interrupts collection and flags interrupted evidence; do not describe it as zero downtime.

### Verify

```bash
curl -fsS http://127.0.0.1:8080/health
journalctl -u curvewatch --since "-3min" --no-pager
```

Using the dashboard's existing authentication without printing its password, inspect:

- `/api/paper`: new `books.cfg`, `books.capitalPolicy`, `books.books.capital`, `books.paired.capital`, all curve-book stop settings at or below 47%.
- `/api/status`: healthy feeds and new fingerprint.
- `/api/picks`: holder provider enabled, errors monitored.
- `/api/studio/late`: isolated experiment's new version.
- `/api/codex`: Capital protection metadata, live positions and correct realized cash after both partials.

The existing Perf book table reads the strategy list dynamically, so it shows the new Capital protection row without a front-end build. Its paired confidence sequence is exposed in `/api/paper`; no dedicated paired chart was added in this release.

Compare every previously closed row's recorded hash after deployment. New decisions must use only the new cohort. Old results remain in the database and the private pre-change export.

Use the atomic database backup as the immutable-row baseline, not a separately timed live query. During rollout, a separate hash scan taken seconds before the backup differed on five very recent rows while the collector was still running. All 4,599 closed rows in the actual pre-deployment SQLite backup matched after deployment.

### Monitoring and recovery

The service and watchdog already run on the VPS; no new cron job is required. Watch the existing dashboard for gaps, holder errors, capital-book partial fills, and paired mean/CS. Treat historical improvement as inconclusive until prospective evidence supports it. Do not auto-promote to real trading.

If application startup fails, restore the backed-up source files and restart once. Source rollback is not authorization to restore an older database over newer collected records. Never overwrite live data as a routine rollback.
