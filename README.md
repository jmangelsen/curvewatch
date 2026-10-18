# Curvewatch

A 24/7 Pump.fun screener that watches every launch, scores tokens during their first 15 minutes on the bonding curve, alerts you on Telegram, and paper-trades every alert under realistic conditions. It records every launch as labeled data so you can tell whether the score actually predicts anything.

It is a **discovery tool with an honest scorekeeper**. It does not place trades, and it never holds a private key.

```
                ┌──────────────────────────────┐
 Solana RPC ───▶│ rpc / rpc2 (logsSubscribe)    │  every Pump.fun trade, create, complete
 (x2, redundant)│  decode Anchor events + slot  │──┐
                └──────────────────────────────┘  │
                ┌──────────────────────────────┐  │   ┌──────────────────────────────┐
 PumpPortal ───▶│ pumpportal (free streams)     │──┼──▶│ Engine (in memory)            │
                │  new tokens + migrations      │  │   │  token state, holders, slots  │
                └──────────────────────────────┘  │   │  features → score every 5s    │
 token metadata (Pinata) ── socials ──────────────┘   │  snapshots at 30s…900s        │
                                                      │  alerts · paper trader        │
                                                      │  outcome labels at +1h        │
                                                      └───────┬───────────┬──────────┘
                                                              │           │
                                       SQLite (WAL) ◀─────────┘           ├──▶ Telegram
                                  tokens · snapshots · alerts             ├──▶ Dashboard (SSE)
                                  paper · creators · wallets              └──▶ healthchecks.io
```

---

## 1. Economics, measured (October 13, 2026)

| Item | Measured / estimated | Notes |
|---|---|---|
| Launch rate | **~30–50 launches/min** (~45–70k/day) | measured live, Oct 13 2026 (rate varies by hour) |
| Trade rate | **~70–80 Pump.fun trades/sec** (~6M/day) | measured live via program logs |
| RPC bandwidth | **~600 KB/s per connection** (~50 GB/day) | about 74% of messages are failed bot transactions |
| PumpPortal trade feed, all tokens | ~6M events/day × 0.01 SOL/10k ≈ **6 SOL/day** | why the default trade source is `rpc`, not PumpPortal |
| Public Solana RPC | $0, but drops about once a minute | 2 parallel connections cover the gaps |
| Paid RPC (optional) | Helius Developer $49/mo + streaming credits (20 credits/MB) | at ~50 GB/day, metered streaming costs far more than the plan. Use paid RPC as primary only once the kill rule passes |
| VPS | 2 vCPU / 4 GB RAM, ~$6–25/mo | RAM in use: ~100–200 MB |
| Build time to production | done (this repo); ~1–2 h to deploy | |
| Revenue | none; a personal trading tool | value depends entirely on whether an edge shows up |

**Kill rule (built in):** the paper trader enters each alert 15 s late, at the real curve price, pays 1.25% each side plus 3% extra slippage, then manages the exit mechanically.

| Status | Meaning |
|---|---|
| `COLLECTING` | fewer than 50 closed trades |
| `FAIL` | average return per trade ≤ 0 |
| `MARGINAL` | positive average, but the 95% confidence interval includes zero |
| `PASS` | the whole interval is above zero |

**Do not put money in before `PASS`.**

---

## 2. Quick start (local)

```bash
# Node 20+ required
git clone <your-repo> curvewatch && cd curvewatch     # or unzip the archive
npm install
cp .env.example .env                                  # optional for local use
npm run selftest                                      # decoder, curve math, scorer
npm start                                             # dashboard at http://localhost:8080
```

Within 10 seconds the Live tab shows launches. Alerts fire a few times per hour at the default `ALERT_SCORE=72`. The calibration and smart-wallet panels fill in after the first labeled hour, and become meaningful after a few days.

---

## 3. Deployment blueprint (24/7 on a VPS)

### 3.1 Provision
1. Create an Ubuntu 24.04 VPS with 2 vCPU and 4 GB RAM (Hetzner, DigitalOcean, Vultr, or similar). Use a US region close to you; latency doesn't matter much for a human-in-the-loop screener.
2. Add your SSH key and note the IP address.

### 3.2 Fastest path: one command
From your computer: `scp curvewatch.zip root@YOUR_VPS_IP:/opt/`, then on the VPS:
```bash
apt-get update && apt-get install -y unzip && cd /opt && unzip -o curvewatch.zip && cd curvewatch && bash deploy/install.sh
```
It installs Docker, the firewall, swap and security updates, creates `.env` with a random dashboard password, optionally saves your Telegram token and chat_id, builds and starts the container, waits for health, and installs the backup and backtest cron jobs. Safe to re-run. The manual steps below do the same thing.

### 3.2b Server setup (manual, run once, as root)
```bash
ssh root@YOUR_VPS_IP
apt-get update && apt-get install -y git
git clone <your-repo> /opt/curvewatch            # or: scp curvewatch.zip root@IP:/opt/ && unzip
bash /opt/curvewatch/deploy/setup-vps.sh         # Docker, firewall (22/80/443), 2 GB swap, auto security updates
```

### 3.3 Configure
```bash
cd /opt/curvewatch
cp .env.example .env
nano .env
```
Set at minimum:

| Variable | Value |
|---|---|
| `DASHBOARD_PASSWORD` | a long random string (`openssl rand -base64 24`) |
| `TELEGRAM_BOT_TOKEN` | from **@BotFather** → `/newbot` |
| `TELEGRAM_CHAT_ID` | open your bot, send `/start`, then run `TELEGRAM_BOT_TOKEN=<token> npm run tg-setup` (or `docker compose run --rm curvewatch node scripts/telegram-setup.js`). It prints your numeric chat id and sends a test message. A @username is not enough. |
| `TELEGRAM_MODE` | `strong` (default): only strong signals and system messages. `all`: every alert too (expect dozens per hour). |
| `TELEGRAM_STRONG_CHAT_ID` | optional second chat or group for strong signals (group ids are negative; add the bot, post, rerun `tg-setup`) |

**Two-way lookups.** Once the token and chat id are set, the bot also answers messages from the allowlisted chat(s). Send a mint address or a pump.fun / DexScreener / Solscan link and it replies with a data card: stage, live curve state, score with its reasons and flags, creator history, holder concentration, the sticky-reject verdict, graduation base rates for that score bucket and reject category, the PumpSwap pool state if it graduated, and this machine's own alerts and paper trades on the token. `/status` gives a one-line health check; `/help` lists commands. Messages from any other chat are ignored and logged. The card is identical for anyone who asks, never uses the words buy or sell, and ends with the disclosure; it is a lookup, not an entry recommendation. Polling uses one `getUpdates` call every 3 s (long-poll), so only one Curvewatch instance should run per bot token.

**Runner board (tab "Runners", Telegram `/runners`, daily picks message).** Each day at `RUNNER_PICK_HOUR` (09:00 local) the board freezes up to `RUNNER_PICKS` young graduates that pass hard filters (graduated, 2–8 h since mint, market cap $100k–$750k, pool ≥ $20k, no reject bucket, creator not a known rugger, $1.5M not already printed) ranked by a registered rule (volume acceleration, buy pressure, strength vs migration and peak, pool depth, organic profile; penalties for paid boosts, vertical 1h moves, sellers dominating). The same eligible set is also cut at random, by market cap and by 1h volume, so the rule is scored against baselines that saw exactly the same coins. Outcomes are labeled from the graduate snapshots 24 h and 48 h later: reached `RUNNER_TARGET_MCAP_USD` ($1.5M), doubled, halved. In the registration sample (86 candidates, Oct 13–16 2026) 6% reached $1.5M within 48 h and 72% halved within 24 h, and no feature separated the doublers from the rest; the board therefore claims no skill until its scorecard shows the rule beating the random cut with non-overlapping intervals (about 30 scored picks per cut). It is a ranked watch set, not a forecast.

| `HEALTHCHECK_URL` | free check at healthchecks.io (period 5 min, grace 5 min); you get emailed if the box or feed dies |
| `RPC_WS_URLS` | leave the public default to start; later add `wss://mainnet.helius-rpc.com/?api-key=KEY,` in front |

### 3.4 Launch
```bash
docker compose up -d --build
docker compose logs -f curvewatch        # expect: connected ×3, then ALERT lines over time
curl -s localhost:8080/health            # {"ok":true,...}
```

### 3.5 Reach the dashboard
- **Option A, SSH tunnel (zero exposure):** `ssh -L 8080:localhost:8080 root@YOUR_VPS_IP`, then open http://localhost:8080
- **Option B, HTTPS on your domain:** point an A record (for example `curvewatch.yourdomain.com`) at the VPS. Put the domain in `deploy/Caddyfile`, then run:
  ```bash
  docker compose --profile https up -d
  ```
  Caddy issues the certificate automatically. Basic auth protects the dashboard; `/health` stays public for monitors.

### 3.6 Scheduled jobs
```bash
crontab -e
# nightly dataset backup at 03:15 (online, safe while running; keeps 14 days)
15 3 * * * /opt/curvewatch/deploy/backup.sh >> /var/log/curvewatch-backup.log 2>&1
# weekly backtest report to file (Mondays 07:00)
0 7 * * 1 cd /opt/curvewatch && docker compose exec -T curvewatch node scripts/backtest.js 120 >> /opt/curvewatch/backups/backtest.log 2>&1
```
Copy the backups off the box occasionally: `scp root@IP:/opt/curvewatch/backups/*.gz .`. The dataset is the asset.

### 3.7 Updating
```bash
cd /opt/curvewatch && git pull && docker compose up -d --build
```
Open paper positions are voided on restart (honest: in-memory curve state is lost), and voided trades don't count toward the kill rule.

### 3.7b One-command DigitalOcean provisioning (API)

`deploy/provision-do.sh` creates the whole server from a laptop or sandbox: uploads an SSH key, creates a `s-1vcpu-2gb` Ubuntu 24.04 Droplet ($12/month, [pricing](https://www.digitalocean.com/pricing/droplets)), waits for boot, uploads the zip and a prepared `.env`, runs `deploy/install-systemd.sh` non-interactively and checks `/health`. Needs a [personal access token](https://cloud.digitalocean.com/account/api/tokens) with `account:read`, `ssh_key:read/create`, `droplet:read/create`, `image:read`, `region:read`, `size:read` (or Full Access), exported as `DIGITALOCEAN_TOKEN`.

```bash
cp deploy/env.production my.env            # fill TELEGRAM_*, DASHBOARD_PASSWORD
ssh-keygen -t ed25519 -f ~/.ssh/curvewatch_deploy -N ""
export DIGITALOCEAN_TOKEN=...
ZIP=../curvewatch.zip ENV_FILE=my.env bash deploy/provision-do.sh
```

Re-running with a new zip updates the code and keeps `data/`, `backups/` and `.env`. Set `EXTRA_PUBKEY="ssh-ed25519 ..."` to add a second key (your PC) to root's `authorized_keys`.

### 3.8 Native install with systemd (no Docker)
One command on a fresh Ubuntu 24.04 / Debian 12 box, with the project unzipped at `/opt/curvewatch`:
```bash
apt-get update && apt-get install -y unzip && mkdir -p /opt && cd /opt && unzip -o ~/curvewatch.zip && cd curvewatch && bash deploy/install-systemd.sh
```
It installs Node 20, creates a locked-down `curvewatch` user, writes `.env` from `deploy/env.production` with a random dashboard password, runs `npm ci` and the tests, installs and starts `deploy/curvewatch.service` (hardened: only `data/` and `backups/` are writable, 1.2 GB memory ceiling, auto-restart), and adds two cron jobs: a verified nightly SQLite backup at 03:15 (`deploy/backup.sh`, 14 kept, optional off-box copy via `BACKUP_RCLONE_REMOTE`) and a weekly `VACUUM` on Sunday 04:30. Re-run the same command to upgrade; it never overwrites `.env` or `data/`.

```bash
systemctl status curvewatch && journalctl -u curvewatch -f    # status and live log
systemctl restart curvewatch                                   # after editing /opt/curvewatch/.env
tail -3 /var/log/curvewatch-backup.log                         # last backups
```

**Watchdog.** `deploy/watchdog.sh` runs from cron every 5 minutes. systemd already restarts a crashed process; the watchdog handles the other failure, a process that is alive while its feeds are dead (stuck websocket, DNS, RPC ban): three consecutive unhealthy `/health` checks restart the unit, log to `/var/log/curvewatch-watchdog.log`, and post to Telegram if configured. Restarts are rate-limited to one per 30 minutes so a dead upstream cannot cause a restart loop.

### 3.9 Monitoring and failure recovery

| Failure | What happens automatically | What you do |
|---|---|---|
| RPC socket drops (often, on public RPC) | exponential-backoff reconnect; second connection covers the gap; duplicates dropped by signature | nothing. If drops exceed ~5/min, add a paid RPC URL first in `RPC_WS_URLS` |
| Feed silently stalls (socket open, no data) | watchdog forces a reconnect after 20 s (RPC) or 90 s (PumpPortal) | nothing |
| PumpPortal down | launches still arrive from on-chain create events | nothing |
| All trade feeds down > 3 min | Telegram "feed unhealthy"; healthcheck pings stop, so you get an email | `docker compose logs --tail 200 curvewatch`; restart |
| Process crash / OOM | Docker `restart: unless-stopped` (or systemd `Restart=always`) | check logs; memory is capped at 768 MB heap |
| Disk growth | retention: trades 14 d, snapshots 30 d (rejected tokens store no features), losing wallets 30 d; WAL checkpoint every 6 h | `du -sh data/`; expect roughly 1–3 GB at steady state (trade tape dominates) |
| Metadata gateway blocks | per-token fallback across two Pinata gateways | if `Metadata ok/fail` (Intel → System) degrades, add a gateway in `src/engine/metadata.js` |
| Pump.fun protocol upgrade changes the event layout | decoder only reads the stable leading fields, and the self-test pins a real mainnet sample | run `npm run selftest`; if decode fails, update `src/sources/decode.js` |

---

## 4. Operating playbook (SOP)

| Phase | Duration | Rule |
|---|---|---|
| 0. Record | days 1–14 | Let it run. Don't trade. Read every alert in Telegram and open the token drawer. Train your eye on what a bundle, wash trading and organic demand look like. |
| 1. Calibrate | day 14 | `docker compose exec curvewatch node scripts/backtest.js 120` (then 60 and 300). Check (a) whether higher score buckets have higher 2× and graduation rates, (b) which features show lift, and (c) whether rejected tokens really underperform. Re-weight `src/engine/score.js` and the thresholds in `.env`. Change one thing at a time and write down why. |
| 2. Paper | until 50+ trades after the last change | Kill rule must show `PASS`. A `MARGINAL` result is not a pass. |
| 3. Live, tiny | if `PASS` | Fixed size of 0.05–0.1 SOL per alert, at most 5% of the $500 bankroll on one token. Take your manual fills from the same alerts and compare them to the paper fills. If your real slippage is worse than the model's, raise `PAPER_EXTRA_SLIPPAGE_PCT` and recheck the kill rule. |
| 4. Review | weekly | Backtest log + kill rule + your own fill log. Any rule change sends you back to phase 2. |

**What you still do yourself:** decide every trade, check the X and Telegram community behind a token, keep a fill log (taxes: every swap is a taxable event in the US), and resist changing more than one variable per review.

---

## 5. How a token is scored

**Hard rejects (score 0, never alerts):**

| Reject | Trigger (configurable) |
|---|---|
| Serial launcher | creator has `SERIAL_RUGGER_LAUNCHES`+ launches and 0 graduations, from your own data |
| Creator dumping | creator has sold ≥ 50% of their peak holding |
| Bundled launch | ≥ 55% of buy volume in the create slot + 1 from ≥ 3 non-creator wallets |
| Concentration | top-10 wallets hold ≥ 45% of supply |
| Fading | ≥ 45% below peak |
| Too late | curve ≥ 88% (you are the exit liquidity for snipers who sell into graduation) |
| Wash trading | > 60% of trades come from wallets with 4+ trades |
| Out of scope | non-SOL quote (USDC-paired launches), mayhem mode |

**Evidence (0–100):**

| Component | Max points | Rule |
|---|---|---|
| Net inflow | 22 | 0.5 → 8 SOL/min of net SOL into the curve |
| Breadth | 16 | 3 → 35 new unique buyers/min |
| Smart wallets | 15 | 5 points per wallet with a proven record in your own data |
| Momentum | 10 | net flow over the last 60 s, 0 → 6 SOL |
| Distribution | 10 | top-10 share, 15% → 45% (lower scores higher) |
| Social links | 10 | Telegram 5, X 3, website 2 |
| Pressure | 8 | buy/sell count ratio 1.1 → 3 |
| Stage | 8 | full points for curve between 12% and 70% |
| Creator history | +6 / −8 | +6 for a prior graduation, −8 for 4+ launches without one |
| Dev skin in the game | 4 | dev bought ≥ 0.5 SOL and still holds |

Penalties: dust-buy spam, partial bundle, creator sold, stalling, fewer than 15 buyers, more than 25% off peak.

The social and dev-buy weights are anchored to published survival analysis (Telegram presence about 9× graduation lift; above-default initial mcap about 4.5× hazard ratio). That study's 24 h labels were later shown to be censored, so treat them as directional priors. **Your own backtest overrides them.**

---

## 5b. Graduates, strong signals, USD

**Graduates tab.** Tracks tokens that already migrated off the bonding curve to PumpSwap and scores them for a second leg (volume pace vs. the hourly average, buy pressure, higher lows, breakouts, liquidity trend, survival). The base rate is hostile: of 11,303 migrations studied by [Belphor](https://www.belphor.com/data/migration-outcomes), 93% later traded at 20% or less of their migration price, 14% reached +50%, and 4.1% reached +200%. So the tab ignores the first 20 minutes after migration, requires $12k+ liquidity, and runs its own paper book and kill rule. Data is from the DexScreener public API (`tokens/v1`, 300 req/min; profiles and boosts 60/min, [docs](https://docs.dexscreener.com/api/reference)).

**Strong signals.** A regular alert means "this scores well". A strong signal means "in your own recorded history, setups that scored like this reached +25% net of fees and slippage before falling 20%, at least 45% of the time, over 30+ independent tokens". Until that history exists, it fires only at score ≥ 85 (curve) or ≥ 82 (graduates), and each message says UNCALIBRATED. It's capped at 4 per hour. Every strong signal is graded afterwards as hit, stopped or flat on the Performance tab. Expect that the calibrated condition is rarely met: if no score band clears 45%, the system is telling you it has no +25% edge.

**USD.** All money is shown in USD, converted at the live SOL/USD price from the deepest SOL/USDC pool on DexScreener (refreshed every 60 s). Internally the curve math stays in SOL.

---

## 5c. Paper books v2 and market conditions (October 13, 2026)

Diagnosis from replaying every recorded trade on 60 alerted tokens (the replay reproduced the live result: 8% win, −30% per trade):

| Change | Win rate | Avg / trade |
|---|---|---|
| v1 exits (TP 2× half, 35% trail, −40% stop) | 8% | −29.9% |
| v2 exits (all out at +25% net, −20% net stop) | 37% | −7.4% |
| v2, entering at 0 s instead of 15 s | 33% | −8.3% |

Breakeven for +25% / −20% net is a 44% win rate. Labeled snapshots scoring 65–72 reached it first 39% of the time (31 tokens, 95% CI 24–56%), and 72+ only 19% (21 tokens). So the alert threshold fires late.

- **v2 exits** are now the default (`PAPER_RULES=v2`). The kill rule counts v2 trades only. v1 trades stay visible as history.
- **Band book**: a parallel paper book that enters the first time a token's live score lands in 65–72. It has the same exits and costs and its own kill rule.
- **Market conditions**: the rolling win rate of the last 20 closed paper trades, with COLD below 30% and back to WARM at 35%. Launch rate, graduations and the SOL 1h move are stored on every entry. The default is shadow mode, because in the replay the pause would have skipped trades that did better (45% win) than the ones it kept (35%). Set `MARKET_GATE_MODE=enforce` only after the WARM vs COLD table on the Performance tab shows COLD entries clearly doing worse over 2+ weeks.

---

## 5d. Strategy lab, trade terminal, report (October 14, 2026)

### Calibration that drove these changes
About 4.3 hours of labeled data (7,479 labeled, unrejected snapshots; 122 alerts). "Hit" = the token reached +25% net before −20% net from that snapshot.

| Score band | Hit rate | Note |
|---|---|---|
| 40–50 | 14% | 111 tokens |
| 50–55 | 27% | |
| 55–60 | 20% | |
| 60–65 | 25% | |
| 65–72 | 30% | 41% first half, 24% second half: did not hold |
| 72–80 | 19% | 63 tokens |
| 80+ | 38% | 8 tokens, too few to trust |

- Above 50, the score barely separates winners from losers. Breakeven for +25%/−20% exits is 44%.
- Only 60s net inflow and median buy size separated winners in both halves. score ≥ 50 & inflow ≥ 12.6 SOL & median buy ≥ 0.387 SOL hit 40% in each half (30 tokens, 95% range 25–58%). The cutoffs were chosen on the full set, so expect some shrinkage. → Flow book.
- Replay of 143 live v2 paper trades (actual: −19.5% per trade). Waiting 60s, entering only if price ≥ signal, and taking +20% gross gave 38% win and −8.1% per trade, consistent in both halves. → Confirm book. Still negative.
- Anti-chase filters and breakeven stops did not help in replay.
- Nothing tested is profitable after the ~5.4% round-trip cost. The books exist to find out on more data, not because they are known to work.

### Books
| Book | Entry | Exits (net of costs) | Breakeven win rate |
|---|---|---|---|
| Main | score ≥ 72 | +25% / −20%, 60 min | 44% |
| Band | score first lands in 65–72 | same | 44% |
| Flow | score ≥ 50, 60s inflow ≥ 12.6 SOL, median buy ≥ 0.387 SOL | same | 44% |
| Confirm | main or band signal, wait 60s, only if price ≥ signal | +20% gross (≈ +13.5% net) / −20% | ~60% |

Every trade stores the signal price and time, entry slippage, entry features, best and worst point, the largest single drop, and a cause:
TARGET, GRADUATED, SMALL WIN, NO FOLLOW-THROUGH (selection), GAVE BACK (exit), LATE ENTRY (speed), DUMP (holder risk), STALLED (activity died). Confirm skips are stored with status `skipped` and a reason. Older trades are labeled once at startup from the trade tape (marked "labeled after the fact").

### Trade terminal (Performance tab)
- Timeline: cumulative USD P&L per book. Each dot is a closed trade (green = win). Hover for details; click to open `why`.
- Scoreboard: per-book verdict, win rate vs breakeven, average per trade, and a 95% range bar.
- Console: `help`, `strategies`, `strategy <book>`, `trades [book] [win|loss|skipped] [n]`, `why <id|SYMBOL>`, `causes [book]`, `compare`, `pnl [24h|7d|14d]`, `report`, `tail on|off`, `clear`. Tab completes, ↑/↓ recalls history, and live ENTRY/EXIT/SKIP lines stream in.
- API: `/api/terminal/strategies?days=`, `/api/terminal/timeline?days=`, `/api/terminal/trades?book=&limit=&before=`, `/api/terminal/trade/:id|SYMBOL`.

### Report tab
`/api/report?days=7|14|30&tz=<minutes>`: coverage, decision checklist, books compared (first vs second half), cumulative P&L, WARM vs COLD, and a daily table. Exports to Markdown and CSV. The "ready for real money" answer stays NO until coverage is ≥ 80% and a book is positive with confidence in both halves.

### Performance work
- Rejected snapshots (~70%) no longer store feature JSON. Snapshots were 52 MB of a 94 MB DB after 6 hours.
- Snapshot retention is now 30 days (was 90).
- The strong-signal history query is cached for 10 minutes and uses a partial index: 72 ms → 0.5 ms. Uncached, it would have grown to seconds per alert.

### Connecting Telegram
1. In Telegram, message @BotFather → `/newbot` → copy the token. Keep it private.
2. Open your new bot and send it `/start`.
3. On the server: `TELEGRAM_BOT_TOKEN=<token> npm run tg-setup`. This prints your numeric chat_id and sends a test message.
4. Add `TELEGRAM_BOT_TOKEN=` and `TELEGRAM_CHAT_ID=` to `.env` (optional: `TELEGRAM_MODE=strong|all`, `TELEGRAM_STRONG_CHAT_ID=`), then restart (`docker compose up -d` or `systemctl restart curvewatch`).
5. On the Performance tab, press "Send test message".

## 5e. Data health, fill realism, benchmarks, drill-downs (October 14, 2026)

Before trusting a two-week verdict, the system now proves the data under it is complete and the paper fills are realistic.

### Health tab
One status (HEALTHY / WATCH / DEGRADED / DOWN) built from these checks. Every check, tile and number opens a drill-down.

| Check | Pass | Warn | Why |
|---|---|---|---|
| Coverage, last 24 h | ≥ 95% | ≥ 80% | minutes with live trade data |
| Coverage, current test | ≥ 80% | ≥ 60% | the two-week verdict needs 80% |
| Trade rate vs baseline | ≥ alarm | ≥ half alarm | alarm = 40% of the slowest 5% of clean minutes |
| Gaps, last 24 h | ≤ 2 and < 10 min | ≤ 8 and < 60 min | silence longer than the gap threshold |
| Reconnects, last hour | ≤ 6 | ≤ 30 | above 30: put a paid RPC first in `RPC_WS_URLS` |
| Launch capture | ≥ 97% | ≥ 90% | PumpPortal launches the RPC feed also saw |
| Event-loop lag p99 | < 50 ms | < 200 ms | late reactions to stops and entries |
| Memory (RSS) | < 600 MB | < 900 MB | |
| Disk free | > 5 GB and > 30 days | > 1 GB | days at the measured growth rate |
| Labeling backlog | 0 | ≤ 5 | alerts past their 1 h horizon without a label |
| Entry fills vs real buyers | median ≥ −0.5% | ≥ −2% | negative = paper model too optimistic |
| Stop overshoot | ≤ 5 pts | ≤ 10 pts | points past −20% where stops actually fill |
| Last backup | < 26 h | < 72 h | |
| SOL/USD price age | < 10 min | < 60 min | |

Calibration of the gap threshold: with trade rate λ per second in the slowest 5% of clean minutes, a natural silence of s seconds has probability e^(−λs). The threshold is the s where that falls below one in a million, clamped to 10–60 s (`HEALTH_GAP_SEC_OVERRIDE` pins it). On first run, coverage history is backfilled from the launch record: in 428 recorded minutes the slowest 1% still had 10 launches, so a zero-launch minute means the scanner was not running.

**Gap backfill (src/engine/backfill.js).** Any downtime (restart, crash, reboot, a sleeping sandbox) is recorded as a data gap. When a gap closes, and at startup for every unbackfilled gap inside the last `BACKFILL_MAX_HOURS` (12), the service recovers the graduations that happened during the window from the chain: one `getSignaturesForAddress` page on the Pump.fun migration account (`39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg`, which every PumpSwap migration references) and one `getTransaction` per migration, paced at `BACKFILL_PACE_MS` (500 ms) and rotated across `RPC_HTTP_URLS` (publicnode, then api.mainnet-beta) on 429 with automatic back-off. The mint is the single `pump`-suffixed account key of the migration transaction. Recovered coins join the graduates watchlist as source `backfill` with the migration time, so the Runner board's eligible set and the graduates tracker do not go blind after downtime. Not recovered: curve-stage trades, launches and snapshots inside the gap (they stay flagged), and a token's mint time when the launch itself was missed (age then counts from migration, which understates it by the curve's duration). Put a paid RPC (Helius) first in `RPC_HTTP_URLS` for unthrottled recovery. The Health tab's gap list shows the outcome per gap.

### Gap rules
- A gap opens on trade silence beyond the threshold, or on process downtime (from a 5 s heartbeat).
- Open paper trades during a gap are flagged `gap=1`; they finish normally and appear in the terminal but are excluded from every stat.
- Outcome labels (tokens, snapshots, alerts) whose window overlaps a gap are flagged and excluded from calibration.
- On restart, alerts and tokens still inside their window cannot be labeled (state was in memory). They are marked lost, not counted as backlog.

### Restart behavior
Open positions are restored, not voided. If the token is gone from memory, its curve is rebuilt from the last recorded trade and kept current from the live stream. Downtime above `HEALTH_RESTORE_MAX_DOWN_SEC` (or unknown) flags the position.

### Settings fingerprint
`src/version.js` hashes every strategy, scoring, lifecycle and kill-rule setting plus the code of the score, token, paper and engine modules. Every paper trade stores it. Stats, the report, the market gate and the terminal summary only use the current fingerprint, so changing a rule starts a new test from zero instead of mixing old and new results.

### Paper realism changes
- Exits are event-driven (checked on every trade, not every 5 s) and fill `PAPER_EXIT_DELAY_SEC` (2 s) after the trigger at whatever the curve then pays. This is why stops land below −20%.
- Fill audit (every 30 s): each paper entry and exit is compared with real wallets on the same token within ±5 s at 0.25–4× the size, fee included. The Health tab shows medians, histograms, per-book numbers and what the slippage setting should be.

### Benchmarks (Performance tab)
- Random control book: at each Main/Band/Flow signal, a random other eligible token of similar age (±50%) and mcap (±40%), same exits and costs. A strategy has to beat this, not just zero.
- Same-token pairs: each book minus Main on tokens both traded, isolating timing and exits from selection.
- Selection lift: alert graduation and 2x rates vs the base rate.
- Graduates vs [Belphor migration outcomes](https://www.belphor.com/data/migration-outcomes) (n = 11,303).

### Stricter kill rule
PASS needs all of: 50+ trades, the 99% low bound of average P&L per trade above zero (six books are tested at once; a 95% bar would let about one in four pass by luck), both halves of the test positive, and beating the Random control (95% low bound of the difference above zero, control with 30+ trades).

### Tests
`npm test` runs the paper-engine tests (entry delay, target and stop with exit delay, idle exit, confirm skip, gap flags, kill rule, restart restore) against a throwaway database with a fake clock. `npm run selftest` checks decoding, curve math and scoring.

## 5f. Edge Lab, 38.5% stop, tape drill, smart-wallet tracker (October 14, 2026)

### Edge Lab (tab "Edge Lab")
Pre-registered hypothesis tests (src/edgelab/). 21 ideas over 5 entry/exit windows (30-60 s, 30-120 s, 60-180 s, 120-300 s, 300-600 s) = 98 tests (18 ideas on all 5 windows, 3 tracked-wallet ideas on a subset); 5 are reference tests (all tokens, alert >= 72, score band 65-72) that can never pass. Each test is hashed (definition + window) at registration; changing a definition creates a new test that starts at zero. Only tokens launched after registration count toward the pass bar. The worker runs every `EDGE_RUN_MIN` minutes against a read-only DB connection.

A test PASSES only if all six checks hold:
1. 300+ tokens counted since registration.
2. Those tokens span 3+ days (added beyond the 300-token spec: the broadest test reached 300 tokens in about 50 minutes, one market regime).
3. Lower confidence bound of net mean >= +2 points after costs, using a Bonferroni-corrected z (1% family error over all non-reference tests, z about 3.7).
4. Both chronological halves positive.
5. Still positive with the best 1% of tokens removed.
6. Beats the all-tokens reference over the same window.

Costs per round trip = max(model 8.25%, audited fill realism 11.4%). Exits are labeled from the token's own snapshots first, then the graduation 1 h peak, then the finalized 1 h mcap. FAIL = 300+ tokens and a net mean <= 0. Status at writing: 0 pass, several FAIL, the rest collecting.

### Tracked-wallet tests (registered October 14, 2026, 19:41 UTC)
Family "Tracked wallets", 8 tests. Context passed to each test = buys recorded live in `smart_trades` by wallets that were on the tracked list at the moment they bought, with age in seconds since launch. Only buys at or before the entry snapshot count (no look-ahead). Hypotheses can now declare `horizons` to run on a subset of windows.
- `tracked60`: a tracked wallet (any basis) bought within 60 s of launch. Windows 60-180, 120-300, 300-600 (entry at 60 s or later, so the full 60 s is observable).
- `tracked60real`: same, only wallets on the realized +50% basis. Same windows.
- `trackedpre`: a tracked wallet bought any time before entry. Windows 120-300, 300-600.
The family test count rose from 85 to 93, so the Bonferroni z went from about 3.68 to 3.70. Existing tests kept their registration hashes.
Caveat: like every Edge Lab test, only tokens that pass the hard rejects are sampled. At registration, 3 of the 4 early tracked-wallet buys were on rejected tokens (creator sold 100%, non-SOL quote), so these tests may fill slowly.

### Stop at 38.5%
All paper stops (PAPER, GRAD, STRONG, CONFIRM) are 38.5%. Replay of 1,053 live exits: 38.5% stop -16.4%/trade vs -13.9% at 20%, -12.2% at 10%, -18.1% with no stop; 38.5% plus a 30 s time stop -11.7%. A wider stop raises the breakeven win rate (about 60.6% at the current take-profit) and stops overshoot on thin curves, so realized losses exceed 38.5%. This was set on request, not because the data favors it.

### Uptime tape drill (Health tab)
Amber ticks on the tape = paper entries, green/red ticks = exits (by P&L). Tap any column: 1h range opens that minute, 6h opens its 10-minute block, 24h opens its hour. The drill lists every paper trade event in order (entries, partial take-profits, stops, exits) for curve and graduate books, positions open during the window, alerts, feed uptime and market trade flow, plus a minute-by-minute table where each minute opens nested (with Back). Trade rows open the token drawer. API: `GET /api/drill/tape:<startMs>-<endMs>` (capped at 6 h), `GET /api/tape/marks?mins=1440`.

### Smart-wallet tracker (Intel tab)
- Metric: for every wallet position (buy >= `TRACK_MIN_BUY_SOL`), return = (SOL from sells + tokens still held x price at the token's 1 h label) / SOL spent - 1. A hit = return >= +`TRACK_PROFIT_PCT`% (50).
- Selection: wallets with >= `TRACK_MIN_POSITIONS` (8) scored positions and hit rate > `TRACK_MIN_RATE` (0.65), excluding wallets above `TRACK_MAX_POS_PER_DAY` (spray bots), ranked by the Wilson 95% lower bound, top `TRACK_TOP_N` (15). Refreshed every `TRACK_REFRESH_MIN` minutes.
- Proxy fill: until 15 wallets qualify on the realized metric, empty slots come from the older record (win = token peaked at 3x+ after the wallet's early buy, or graduated). Rows are labeled PROXY. That is peak-touching, not profit-taking; treat it as a watchlist.
- Every buy/sell by a tracked wallet is stored live (`smart_trades`), open positions are marked to the curve, and per-wallet drills show scored positions and trades. Tables: wallet_perf, wallet_positions, smart_trades (30-day retention).
- The scoring feature `smartBuyers` still uses the older smart set; it was not switched, so the paper-test fingerprint is unchanged.
- API: `GET /api/tracker`, drills `tracker`, `tr_trades`, `tr_open`, `wallet:<address>`.

## 5g. Rejects bucket and the Rejects tab (October 15, 2026)

Rule: a coin that fails any hard filter once is rejected for good (sticky). From that moment it gets no alerts, no paper entry in any book (main, band, flow, confirm, random control, graduates), no tracked-wallet trade records, and no Edge Lab samples. Paper fills re-check the rule at the moment of fill (`rejected before entry: ...` skips). Positions already open when a coin is rejected keep their normal exits. The graduates' post-migration warm-up is not a reject.

- New coin rejects (src/engine/score.js): non-SOL quote, mayhem mode, serial launcher, creator sold, bundled launch, top-10 concentration, drawdown from peak, late on curve, wash trading.
- Graduate rejects (src/engine/graduates.js): low liquidity, collapsed vs migration, no trades in 5 min, thin pool.
- Table `rejects` (kind, mint, first_ts, reason, category, age, mcap at reject). Backfilled once from snapshots and grad_snapshots on first start (kv `rejects_backfill_v1`).
- Rejects tab: 24 h counts and share of launches/graduates, reasons with a "2x+ after reject" rate (curve: max mcap after the rejecting snapshot; graduates: 6 h high after the rejecting poll), live feed with New coins / Graduated switch and reason filters, blocked-trade counters. Every tile, reason and row opens a drill-down or the coin's drawer.
- Smart-wallet tracker: views hide every trade on a coin in the bucket; wallet ranking restarted in new tables `wallet_perf2` / `wallet_positions2` scored only on never-rejected coins (old tables kept, not deleted).
- Edge Lab: snapshots of coins rejected at or before the entry snapshot are skipped (no look-ahead).
- API: `GET /api/rejects?h=24`; drills `rej_curve`, `rej_grad`, `rej_missed_curve`, `rej_missed_grad`, `rej_blocked`, `rej_cat:<kind>:<category>`.
- Caveats: the graduates paper book has no settings fingerprint, so its history mixes pre- and post-rule trades; about 500 graduate rejects recorded at the first restart carry the restart time, not the true first-reject time; non-SOL-quote coins' mcap is computed with SOL curve math and is unreliable.

## 6. Known limitations (red team)

1. **Speed.** Sniper bots buy in the create slot. The alert waits 45 s by design, and your reaction adds ~15 s more. In live tests, prices moved 20%+ in the 15 s between alert and paper entry. The edge, if any, has to come from selection, not speed.
2. **Holder balances come from curve trades only.** Wallet-to-wallet SPL transfers are invisible here. A bundler who buys with one wallet and transfers to 20 fresh wallets looks *less* concentrated than it is. The bundle-slot check catches the buy side, not the fan-out. Upgrade: resolve the top holders via `getTokenLargestAccounts` on a paid RPC for tokens above score 50.
3. **Everything public gets gamed.** Fake Telegram groups, wallets that wash trade to fake breadth, and creators who seed "smart" wallets all exist to trip screeners like this one. The smart-wallet set is built from *your* labels with a spray-bot cap, which helps but doesn't immunize.
4. **Outcome labels stop at graduation for the curve price.** Post-graduation prices are checked on DexScreener at 6 h and 24 h for alerted tokens only. The paper trader conservatively sells at curve close.
5. **Smart-wallet "wins" approximate** each wallet's exit opportunity by the token's peak after their entry. That's generous, so require many observations before trusting it.
6. **Public RPC is best-effort.** Missed trades during reconnects slightly distort holder maps. Two parallel connections mitigate this; a paid RPC fixes it.
7. **Restarts** wipe in-memory curve state. Open paper trades are voided (not guessed) and tokens in their first hour lose their outcome labels.

---

## 7. Files

```
src/config.js            all settings (env-overridable), curve constants
src/sources/feed.js      resilient websocket base: backoff + stale watchdog
src/sources/rpcLogs.js   on-chain firehose (logsSubscribe on the Pump.fun program)
src/sources/decode.js    TradeEvent / CreateEvent / CompleteEvent decoders
src/sources/pumpportal.js free create + migration streams; optional metered trades
src/engine/token.js      per-token state + feature extraction (bundles, holders, flow)
src/engine/score.js      hard rejects + weighted evidence
src/engine/engine.js     lifecycle, snapshots, alerts, outcome labeling
src/engine/paper.js      paper trader + kill rule (95% CI on expectancy)
src/engine/intel.js      creator reputation + smart-wallet learning
src/engine/metadata.js   token metadata → Telegram/X/website detection
src/engine/telegram.js   rate-limited Telegram delivery
src/engine/dex.js        DexScreener post-graduation checks
src/stats.js             dataset + calibration analytics
src/server.js            REST API, SSE stream, static dashboard, basic auth
public/                  dashboard (vanilla JS, no build)
scripts/backtest.js      threshold sweep + path-aware P&L + feature lift
scripts/selftest.js      offline tests against a real mainnet event
deploy/                  VPS setup, Caddy HTTPS, systemd unit, backups
```

API: `/health`, `/api/status`, `/api/radar`, `/api/alerts`, `/api/token/:mint`, `/api/paper`, `/api/calibration?checkpoint=120`, `/api/dataset`, `/api/intel`, `/api/config`, `/api/stream` (SSE).

---

Screener signals are research output, not financial advice. Memecoins on bonding curves are adversarial, and you should expect most tokens, including most alerts, to go to zero.
