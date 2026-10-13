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

### 3.2 Server setup (run once, as root)
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

### 3.8 systemd alternative (no Docker)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs build-essential
useradd -r -s /usr/sbin/nologin curvewatch && chown -R curvewatch /opt/curvewatch
cd /opt/curvewatch && sudo -u curvewatch npm ci --omit=dev
cp deploy/curvewatch.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now curvewatch
journalctl -u curvewatch -f
```

### 3.9 Monitoring and failure recovery

| Failure | What happens automatically | What you do |
|---|---|---|
| RPC socket drops (often, on public RPC) | exponential-backoff reconnect; second connection covers the gap; duplicates dropped by signature | nothing. If drops exceed ~5/min, add a paid RPC URL first in `RPC_WS_URLS` |
| Feed silently stalls (socket open, no data) | watchdog forces a reconnect after 20 s (RPC) or 90 s (PumpPortal) | nothing |
| PumpPortal down | launches still arrive from on-chain create events | nothing |
| All trade feeds down > 3 min | Telegram "feed unhealthy"; healthcheck pings stop, so you get an email | `docker compose logs --tail 200 curvewatch`; restart |
| Process crash / OOM | Docker `restart: unless-stopped` (or systemd `Restart=always`) | check logs; memory is capped at 768 MB heap |
| Disk growth | retention: trades 14 d, snapshots 90 d, losing wallets 30 d; WAL checkpoint every 6 h | `du -sh data/`; expect ~150–400 MB/week |
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
