// Central configuration. Every value can be overridden with an environment variable.
// Scoring weights are PRIORS, not truths: recalibrate them with `npm run backtest` after 2+ weeks of data.
import fs from 'node:fs';
import path from 'node:path';

// Minimal .env loader (no dependency). Real env vars win over the file.
const envFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = process.env;
const num = (k, d) => (env[k] !== undefined && env[k] !== '' ? Number(env[k]) : d);
const str = (k, d) => (env[k] !== undefined && env[k] !== '' ? env[k] : d);
const bool = (k, d) => (env[k] === undefined || env[k] === '' ? d : ['1', 'true', 'yes'].includes(env[k].toLowerCase()));
const list = (k, d) => str(k, d).split(',').map((s) => s.trim()).filter(Boolean);

const dataDir = path.resolve(str('DATA_DIR', './data'));
fs.mkdirSync(dataDir, { recursive: true });

export const config = {
  port: num('PORT', 8080),
  // Loopback unless BIND_HOST is set. Docker sets 0.0.0.0 because the published port is already host-loopback.
  // Production systemd leaves this unset, so the process is not reachable off the box except through Caddy.
  bindHost: str('BIND_HOST', '127.0.0.1'),
  // Explicit local-dev opt-out. Ignored when DASHBOARD_PASSWORD is set. Never set this on the VPS.
  allowUnauthenticated: bool('CURVEWATCH_ALLOW_UNAUTHENTICATED', false),
  dataDir,
  dbPath: path.join(dataDir, 'curvewatch.db'),
  logLevel: str('LOG_LEVEL', 'info'),

  // ---- Data sources ----
  pumpportal: {
    url: str('PUMPPORTAL_WS', 'wss://pumpportal.fun/api/data'),
    apiKey: str('PUMPPORTAL_API_KEY', ''), // only needed if TRADE_SOURCE=pumpportal
    staleSec: num('PUMPPORTAL_STALE_SEC', 90), // watchdog: reconnect if no message for this long
  },
  // 'rpc' (recommended): every Pump.fun trade decoded from on-chain program logs. Free on public RPC,
  //   includes slot numbers (needed for bundle detection) and gives an unbiased dataset.
  // 'pumpportal': per-token trade subscriptions (metered 0.01 SOL / 10k events, no slot data).
  tradeSource: str('TRADE_SOURCE', 'rpc'),
  rpc: {
    wsUrls: list('RPC_WS_URLS', 'wss://api.mainnet-beta.solana.com'),
    staleSec: num('RPC_STALE_SEC', 20),
    parallel: num('RPC_PARALLEL', 2), // redundant connections; duplicates are de-duplicated by signature
    commitment: str('RPC_COMMITMENT', 'processed'),
  },
  pumpProgramId: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',

  // ---- Token lifecycle ----
  lifecycle: {
    activeWindowSec: num('ACTIVE_WINDOW_SEC', 900), // full trade-level tracking (alerts can fire in this window)
    outcomeHorizonSec: num('OUTCOME_HORIZON_SEC', 3600), // label outcomes after this long
    alertedHorizonSec: num('ALERTED_HORIZON_SEC', 86400), // keep tracking alerted tokens this long
    evalIntervalSec: num('EVAL_INTERVAL_SEC', 5),
    snapshotCheckpointsSec: list('SNAPSHOT_CHECKPOINTS', '30,60,120,180,300,600,900').map(Number),
    maxTradesPerToken: num('MAX_TRADES_PER_TOKEN', 4000),
    pendingTradeTtlSec: 20,
  },

  // ---- Scoring ----
  scoring: {
    alertScore: num('ALERT_SCORE', 72),
    watchScore: num('WATCH_SCORE', 50),
    minAgeSec: num('ALERT_MIN_AGE_SEC', 45), // let the bot wave show its hand first
    maxAgeSec: num('ALERT_MAX_AGE_SEC', 900),
    minUniqueBuyers: num('MIN_UNIQUE_BUYERS', 15),
    maxTop10Pct: num('MAX_TOP10_PCT', 45),
    maxCreatorSoldPct: num('MAX_CREATOR_SOLD_PCT', 50),
    maxBundlePct: num('MAX_BUNDLE_PCT', 55),
    maxDrawdownPct: num('MAX_DRAWDOWN_PCT', 45),
    maxCurveProgressPct: num('MAX_CURVE_PROGRESS_PCT', 88), // late = you are the exit liquidity
    serialRuggerLaunches: num('SERIAL_RUGGER_LAUNCHES', 8), // N+ launches with 0 graduations => reject
    metadataFetch: bool('FETCH_METADATA', true),
  },

  smartWallets: {
    earlyWindowSec: 120,
    winMultiple: 3,
    minEarlyBuys: num('SMART_MIN_EARLY_BUYS', 5),
    minWins: num('SMART_MIN_WINS', 3),
    minWinRate: num('SMART_MIN_WIN_RATE', 0.35),
    maxEarlyBuysPerDay: num('SMART_MAX_BUYS_PER_DAY', 150), // above this it's a spray bot, not skill
  },
  // Smart-wallet tracker: wallets whose positions return >= +profitPct (realized + marked at the 1 h label) more than minRate of the time
  smartTracker: {
    topN: num('TRACK_TOP_N', 15),
    profitPct: num('TRACK_PROFIT_PCT', 50),
    minRate: num('TRACK_MIN_RATE', 0.65),
    minPositions: num('TRACK_MIN_POSITIONS', 8),
    minBuySol: num('TRACK_MIN_BUY_SOL', 0.05),      // ignore dust positions
    maxPositionsPerDay: num('TRACK_MAX_POS_PER_DAY', 150), // spray bots are excluded
    refreshMin: num('TRACK_REFRESH_MIN', 10),
  },

  // ---- Paper trading (the kill-rule judge) ----
  paper: {
    enabled: bool('PAPER_ENABLED', true),
    sizeSol: num('PAPER_SIZE_SOL', 0.2),
    entryDelaySec: num('PAPER_ENTRY_DELAY_SEC', 15), // human reaction time: see alert, open app, sign
    extraSlippagePct: num('PAPER_EXTRA_SLIPPAGE_PCT', 3), // competing buyers in the same seconds
    feePct: num('PAPER_FEE_PCT', 1.25), // Pump.fun bonding-curve fee, each side
    // Live exit: sell at tp1Multiple (default +25% net) and stop at stopPct (default 38.5, capped at 47 by capitalPolicy).
    // The October 2026 v2 replay (win rate 8% -> 37%, expectancy -30% -> -7%) used a -20% net stop. That stop is not
    // the live setting. Breakeven win rate = stop / (target + stop): 38.5 / (25 + 38.5) is about 60.6%, not 44%.
    // v1 was TP 2x half / 35% trail / -40% stop.
    rules: str('PAPER_RULES', 'v2'),
    tp1Multiple: num('PAPER_TP1_MULT', 1.25),
    tp1Fraction: num('PAPER_TP1_FRACTION', 1),
    trailPct: num('PAPER_TRAIL_PCT', 35),
    stopPct: num('PAPER_STOP_PCT', 38.5),
    maxHoldMin: num('PAPER_MAX_HOLD_MIN', 60),
    idleExitMin: num('PAPER_IDLE_EXIT_MIN', 10),
    // Exits are checked on every trade of an open token; once a target/stop triggers, the sell fills at the curve
    // price this many seconds later (bot reaction + confirmation). 0 = fill at the triggering trade.
    exitDelaySec: num('PAPER_EXIT_DELAY_SEC', 2),
  },
  // Parallel paper book: enters when a token's score first lands in [BAND_LO, BAND_HI) instead of >= alertScore.
  // Historical label (October 2026, -20% net stop, not the live 38.5% stop): 65-72 hit +25% net before -20% net
  // 39% of the time (31 tokens, CI 24-56%) vs 19% for 72+.
  band: {
    enabled: bool('BAND_ENABLED', true),
    lo: num('BAND_LO', 65),
    hi: num('BAND_HI', 72),
  },

  // Strategy lab: extra paper books, each with its own entry/exit, judged side by side (October 14, 2026 calibration).
  strategies: {
    follow: { enabled: bool('FOLLOW_ENABLED', true), minPost: num('FOLLOW_MIN_POST', 0.10), minBuySol: num('FOLLOW_MIN_BUY_SOL', 0.2), maxAgeSec: num('FOLLOW_MAX_AGE_SEC', 1800) },
    // Labeled snapshots (198 tokens at score >= 50): only 60s net inflow and median buy size separated winners in BOTH halves.
    // score>=50 & flow60>=12.6 & medBuy>=0.387 hit +25% net before -20% net 40% in each half (30 tokens).
    // 44% was the breakeven of that -20% stop, not the live 38.5% stop (live breakeven is about 60.6%).
    flow: { enabled: bool('FLOW_ENABLED', true), minScore: num('FLOW_MIN_SCORE', 50), minFlow60Sol: num('FLOW_MIN_FLOW60_SOL', 12.6), minMedianBuySol: num('FLOW_MIN_MEDIAN_BUY_SOL', 0.387) },
    // Replay of 143 v2 paper trades: wait 60s, enter only if price >= signal, TP +20% gross: 38% win, -8.1%/trade in both halves (live v2: -19.5%).
    // Control group: at each Main/Band/Flow signal, buy a random OTHER eligible token matched on age and mcap.
    // Every strategy must beat this, not just zero; otherwise the score adds nothing over picking at random.
    random: { enabled: bool('RANDOM_ENABLED', true), ageTolPct: num('RANDOM_AGE_TOL_PCT', 50), mcapTolPct: num('RANDOM_MCAP_TOL_PCT', 40) },
    // Candidate books (registered 2026-10-16 after the first two full days came in at −14…−21% for every book).
    clean: { enabled: bool('CLEAN_ENABLED', true), maxBundlePct: num('CLEAN_MAX_BUNDLE_PCT', 25), maxTop10Pct: num('CLEAN_MAX_TOP10_PCT', 40) },
    hold120: { enabled: bool('HOLD120_ENABLED', true), checkpointSec: num('HOLD120_CHECKPOINT_SEC', 120) },
    timed: { enabled: bool('TIMED_ENABLED', true), holdMin: num('TIMED_HOLD_MIN', 60) },
    scale: { enabled: bool('SCALE_ENABLED', true) },
    confirm: { enabled: bool('CONFIRM_ENABLED', true), waitSec: num('CONFIRM_WAIT_SEC', 60), minRetPct: num('CONFIRM_MIN_RET_PCT', 0), tpGrossPct: num('CONFIRM_TP_GROSS_PCT', 20), stopNetPct: num('CONFIRM_STOP_NET_PCT', 38.5) },
    // Unpriced checkpoint book (pre-registered 2026-10-28). Same switch covers the matched control.
    // Score formula and the PASS bar are in src/engine/unpriced.js and docs/decisions/2026-10-28-unpriced-checkpoint.md.
    unpriced: {
      enabled: bool('UNPRICED_ENABLED', true),
      checkpointSec: num('UNPRICED_CHECKPOINT_SEC', 120),
      minScore: num('UNPRICED_MIN_SCORE', 60),
      matchWindowSec: num('UNPRICED_MATCH_WINDOW_SEC', 30),
      earlySec: num('UNPRICED_EARLY_SEC', 60),
      maxExtensionPct: num('UNPRICED_MAX_EXTENSION_PCT', 80),
      minNetSol: num('UNPRICED_MIN_NET_SOL', 1),
    },
    unpricedctl: { enabled: bool('UNPRICED_ENABLED', true) },
    // Winner tracks v1 (2026-10-29). Every number below is a PROVISIONAL prior, not a fit.
    // See docs/winner-tracks-v1.md. Paper only. Does not change Main's entry or exits.
    // runnerA: fast curve runners. Sustained score, not the first crossing of the alert line.
    runnerA: {
      provisional: true,
      enabled: bool('RUNNER_A_ENABLED', true),
      minCurvePct: num('RUNNER_A_MIN_CURVE_PCT', 25),
      maxCurvePct: num('RUNNER_A_MAX_CURVE_PCT', 60),
      maxMcapUsd: num('RUNNER_A_MAX_MCAP_USD', 40000),
      minScore: num('RUNNER_A_MIN_SCORE', 72),
      sustainSec: num('RUNNER_A_SUSTAIN_SEC', 20),
      maxPremiumPct: num('RUNNER_A_MAX_PREMIUM_PCT', 12),
      priceWindowSec: num('RUNNER_A_PRICE_WINDOW_SEC', 180),
      minPrints: num('RUNNER_A_MIN_PRINTS', 3),
      buyerRise: num('RUNNER_A_BUYER_RISE', 0),
      minHistorySec: num('RUNNER_A_MIN_HISTORY_SEC', 120),
      exitMcapUsd: num('RUNNER_A_EXIT_MCAP_USD', 100000),
      exitCurvePct: num('RUNNER_A_EXIT_CURVE_PCT', 95),
      trailPct: num('RUNNER_A_TRAIL_PCT', 20),
      maxHoldMin: num('RUNNER_A_MAX_HOLD_MIN', 20),
      bundleWindowSec: num('RUNNER_A_BUNDLE_WINDOW_SEC', 60),
      bundleSellMaxNetSol: num('RUNNER_A_BUNDLE_SELL_MAX_NET_SOL', 0),
      // Anecdotal (28 winners, 18 rugs). Not fitted. First N wallets' share of supply in the opening seconds.
      snipeWallets: num('RUNNER_A_SNIPE_WALLETS', 19),
      snipeWindowSec: num('RUNNER_A_SNIPE_WINDOW_SEC', 10),
      snipeSupplyPct: num('RUNNER_A_SNIPE_SUPPLY_PCT', 79),
      snipeSizeFrac: num('RUNNER_A_SNIPE_SIZE_FRAC', 0.25),
      snipeFastBondSec: num('RUNNER_A_SNIPE_FAST_BOND_SEC', 15),
    },
    runnerActl: { provisional: true, enabled: bool('RUNNER_A_ENABLED', true) },
    // holderB: post-bond holders. Decided once, on the first observation at or after minAgeMin.
    holderB: {
      provisional: true,
      enabled: bool('HOLDER_B_ENABLED', true),
      minAgeMin: num('HOLDER_B_MIN_AGE_MIN', 30),
      floorMin: num('HOLDER_B_FLOOR_MIN', 15),
      floorFrac: num('HOLDER_B_FLOOR_FRAC', 0.90),
      maxBundlePct: num('HOLDER_B_MAX_BUNDLE_PCT', 25),
      minCreatorHoldPct: num('HOLDER_B_MIN_CREATOR_HOLD_PCT', 0.01),
      top10FlatPp: num('HOLDER_B_TOP10_FLAT_PP', 0.5),
      stopPct: num('HOLDER_B_STOP_PCT', 38.5),
      tp1Multiple: num('HOLDER_B_TP1_MULT', 2),
      tp1Fraction: num('HOLDER_B_TP1_FRACTION', 0.5),
      maxHoldMin: num('HOLDER_B_MAX_HOLD_MIN', 1440),
      survivalHorizonsH: [24, 72],
      survivalFloorFrac: num('HOLDER_B_SURVIVAL_FLOOR', 0.5),
      // Anecdotal spread of early bags. Logged on the book. Not an entry threshold.
      earlyMaxBagPct: num('HOLDER_B_EARLY_MAX_BAG_PCT', 5),
      earlyTop5Pct: num('HOLDER_B_EARLY_TOP5_PCT', 15),
    },
    holderBctl: { provisional: true, enabled: bool('HOLDER_B_ENABLED', true) },
  },

  // Market conditions: rolling win rate of the last N closed paper trades (both books).
  // shadow = label and measure only (default: the replay showed the pause would have skipped BETTER trades);
  // enforce = while cold, paper entries are tagged gated and excluded from the kill rule, and strong signals are held back.
  marketGate: {
    mode: str('MARKET_GATE_MODE', 'shadow'),
    window: num('MARKET_GATE_WINDOW', 20),
    minTrades: num('MARKET_GATE_MIN_TRADES', 10),
    pauseBelowPct: num('MARKET_GATE_PAUSE_BELOW', 30),
    resumeAtPct: num('MARKET_GATE_RESUME_AT', 35),
    lookbackHours: num('MARKET_GATE_LOOKBACK_H', 6),
  },

  // Runner board (registered 2026-10-17): young graduates most likely to go on a $1.5M+ run, frozen daily and scored later.
  runners: { enabled: bool('RUNNERS_ENABLED', true), picks: num('RUNNER_PICKS', 10), pickHour: num('RUNNER_PICK_HOUR', 9), minEligible: num('RUNNER_MIN_ELIGIBLE', 5),
    minAgeH: num('RUNNER_MIN_AGE_H', 2), maxAgeH: num('RUNNER_MAX_AGE_H', 8), minMcapUsd: num('RUNNER_MIN_MCAP_USD', 100000), maxMcapUsd: num('RUNNER_MAX_MCAP_USD', 750000),
    minLiqUsd: num('RUNNER_MIN_LIQ_USD', 20000), targetMcapUsd: num('RUNNER_TARGET_MCAP_USD', 1500000) },
  // On-chain holder counts for graduates (Helius DAS getTokenAccounts). Off without a key; counts are then null, never zero.
  // Budget: Helius free plan = 1M credits/month, every DAS call = 10 credits, 2 DAS requests/s. Defaults below spend at most
  // 2,400 calls/day (24k credits, ~720k/month) and the daily cap stops the poller before the plan does.
  holders: { apiKey: process.env.HELIUS_API_KEY || '', tickMs: num('HOLDERS_TICK_MS', 300000), perTick: num('HOLDERS_PER_TICK', 12), staleMin: num('HOLDERS_STALE_MIN', 30),
    maxPages: num('HOLDERS_MAX_PAGES', 3), paceMs: num('HOLDERS_PACE_MS', 600), runnerMin: num('HOLDERS_RUNNER_MIN', 2500), dailyCalls: num('HOLDERS_DAILY_CALLS', 2600),
    // Horde schedule (Hypothesis 3): every new graduate every 20 min for its first 3 h, then hourly to 24 h while above $30k.
    // ~200 graduates/day -> ~2,600 calls/day -> ~1M Helius credits/month on the free plan (DAS = 10 credits, ~1.3 pages avg).
    horde: { firstHours: num('HORDE_FIRST_HOURS', 3), everyMin: num('HORDE_EVERY_MIN', 20), laterHours: num('HORDE_LATER_HOURS', 24), laterEveryMin: num('HORDE_LATER_EVERY_MIN', 60), laterMinMcapUsd: num('HORDE_LATER_MIN_MCAP_USD', 30000), legMult: num('HORDE_LEG_MULT', 3), legEveryMin: num('HORDE_LEG_EVERY_MIN', 5) } },
  // 24-hour gate: the bar a book must clear on a rolling day before any money is discussed. Written before looking.
  gate24h: { hours: num('GATE24_HOURS', 24), minN: num('GATE24_MIN_N', 300), minMeanPct: num('GATE24_MIN_MEAN_PCT', 0), minLoPct: num('GATE24_MIN_LO_PCT', -3) },
  killRule: {
    // PASS needs all of: n >= minTrades, 99% low bound of avg P&L/trade > 0, both halves positive, and beating the
    // random control book (95% low bound of the difference > 0). Six books at a 95% bar would pass one by luck ~26% of the time.
    confidence: num('KILL_CONFIDENCE', 0.99),
    minTrades: num('KILL_MIN_TRADES', 50),
    windowTrades: num('KILL_WINDOW_TRADES', 200),
  },

  // ---- Post-graduation tracker (PumpSwap survivors, data from DexScreener's free API) ----
  grads: {
    enabled: bool('GRAD_ENABLED', true),
    pollSec: num('GRAD_POLL_SEC', 60), // one batched DexScreener pass over the watchlist
    maxWatch: num('GRAD_MAX_WATCH', 1500), // 30 tokens per request -> 50 requests per pass (DexScreener allows 300/min)
    minAgeMin: num('GRAD_MIN_AGE_MIN', 20), // skip the BOOST buyback window and the migration dump
    maxAgeHours: num('GRAD_MAX_AGE_H', 72), // base window; past it a graduate stays watched only while it is "alive" (below)
    extMaxAgeHours: num('GRAD_EXT_MAX_AGE_H', 336), // hard ceiling for alive graduates (14 days) so the watchlist stays bounded
    aliveVsMig: num('GRAD_ALIVE_VS_MIG', 1.0), // alive = price >= this multiple of the migration price (or >= 50% of its peak when the migration price is unknown)
    aliveVol24Usd: num('GRAD_ALIVE_VOL24_USD', 25000), // ... and 24 h volume at least this, and liquidity above the minimum
    minLiqUsd: num('GRAD_MIN_LIQ_USD', 12000),
    deadLiqUsd: num('GRAD_DEAD_LIQ_USD', 4000), // dropped from the watchlist below this
    collapsedFrac: num('GRAD_COLLAPSED_FRAC', 0.2), // rejected at <= 20% of the migration price
    alertScore: num('GRAD_ALERT_SCORE', 70),
    alertCooldownMin: num('GRAD_ALERT_COOLDOWN_MIN', 120),
    seedFromDex: bool('GRAD_SEED_DEX', true), // also watch Pump.fun tokens surfacing in DexScreener profiles/boosts
    snapshotEveryMin: num('GRAD_SNAPSHOT_MIN', 10),
  },
  gradPaper: {
    enabled: bool('GRAD_PAPER_ENABLED', true),
    sizeSol: num('GRAD_PAPER_SIZE_SOL', 0.2),
    feePct: num('GRAD_PAPER_FEE_PCT', 1.0), // PumpSwap fee tier varies with mcap; 1% each side is conservative
    extraSlippagePct: num('GRAD_PAPER_EXTRA_SLIPPAGE_PCT', 2),
    tp1Multiple: num('GRAD_PAPER_TP1_MULT', 1.5),
    tp1Fraction: num('GRAD_PAPER_TP1_FRACTION', 0.5),
    trailPct: num('GRAD_PAPER_TRAIL_PCT', 25),
    stopPct: num('GRAD_PAPER_STOP_PCT', 38.5),
    maxHoldMin: num('GRAD_PAPER_MAX_HOLD_MIN', 360),
    // Second, separate book on the same alerts: no partial take-profit and no 6 h clock. Hard stop until the position is up
    // trailArmMultiple, then a trailing stop from the peak. Exists to test whether the fixed book's max hold is what caps the winners.
    trailEnabled: bool('GRAD_TRAIL_ENABLED', true),
    trailBookPct: num('GRAD_TRAIL_BOOK_PCT', 30),
    trailArmMultiple: num('GRAD_TRAIL_ARM_MULT', 1.2),
    trailMaxHoldMin: num('GRAD_TRAIL_MAX_HOLD_MIN', 4320), // 72 h ceiling, only so a dead-flat position cannot live forever
  },

  // ---- Strong signals: high-conviction tier pushed to Telegram ----
  // "Strong" means your own history says setups like this reached +TARGET% (net of fees and slippage)
  // before falling STOP%, at least MIN_HIT% of the time over MIN_SAMPLES+ cases. Until that history
  // exists the trigger falls back to a strict score cutoff and every message says it is uncalibrated.
  strong: {
    enabled: bool('STRONG_ENABLED', true),
    targetPct: num('STRONG_TARGET_PCT', 25),
    stopPct: num('STRONG_STOP_PCT', 38.5),
    minHitPct: num('STRONG_MIN_HIT_PCT', 45),
    minSamples: num('STRONG_MIN_SAMPLES', 30),
    scoreBand: num('STRONG_SCORE_BAND', 6), // "similar" = historical snapshots within +/- this many score points
    fallbackCurveScore: num('STRONG_FALLBACK_CURVE_SCORE', 85),
    fallbackGradScore: num('STRONG_FALLBACK_GRAD_SCORE', 82),
    maxPerHour: num('STRONG_MAX_PER_HOUR', 4),
    lookbackDays: num('STRONG_LOOKBACK_DAYS', 30),
  },

  // ---- Alerts / ops ----
  telegram: {
    botToken: str('TELEGRAM_BOT_TOKEN', ''),
    chatId: str('TELEGRAM_CHAT_ID', ''),
    strongChatId: str('TELEGRAM_STRONG_CHAT_ID', ''), // optional separate chat for strong signals
    // all = every alert + strong signals; strong = only strong signals + system messages; off = nothing
    mode: str('TELEGRAM_MODE', 'strong'),
    dailySummaryHour: num('DAILY_SUMMARY_HOUR', 8),
    timezone: str('TZ_NAME', 'America/Denver'),
  },
  dashboardPassword: str('DASHBOARD_PASSWORD', ''),
  healthcheckUrl: str('HEALTHCHECK_URL', ''), // e.g. https://hc-ping.com/<uuid>
  // Data health (Health tab). gapSec is the starting threshold; it self-calibrates from this machine's baseline.
  health: { gapSec: num('HEALTH_GAP_SEC', 15), gapSecOverride: num('HEALTH_GAP_SEC_OVERRIDE', 0), restoreMaxDownSec: num('HEALTH_RESTORE_MAX_DOWN_SEC', 30) },

  retention: {
    tradesDays: num('RETAIN_TRADES_DAYS', 60),
    snapshotsDays: num('RETAIN_SNAPSHOTS_DAYS', 180),
    walletsDays: num('RETAIN_WALLETS_DAYS', 365),
  },
};

// Pump.fun bonding-curve constants (SOL-quoted curves)
export const CURVE = {
  INITIAL_VSOL: 30, // SOL
  INITIAL_VTOKENS: 1_073_000_000, // whole tokens
  INITIAL_REAL_TOKENS: 793_100_000, // tokens sold on the curve before graduation
  TOTAL_SUPPLY: 1_000_000_000,
  TOKEN_DECIMALS: 6,
  LAMPORTS: 1e9,
};
