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

  // ---- Paper trading (the kill-rule judge) ----
  paper: {
    enabled: bool('PAPER_ENABLED', true),
    sizeSol: num('PAPER_SIZE_SOL', 0.2),
    entryDelaySec: num('PAPER_ENTRY_DELAY_SEC', 15), // human reaction time: see alert, open app, sign
    extraSlippagePct: num('PAPER_EXTRA_SLIPPAGE_PCT', 3), // competing buyers in the same seconds
    feePct: num('PAPER_FEE_PCT', 1.25), // Pump.fun bonding-curve fee, each side
    tp1Multiple: num('PAPER_TP1_MULT', 2),
    tp1Fraction: num('PAPER_TP1_FRACTION', 0.5),
    trailPct: num('PAPER_TRAIL_PCT', 35),
    stopPct: num('PAPER_STOP_PCT', 40),
    maxHoldMin: num('PAPER_MAX_HOLD_MIN', 60),
    idleExitMin: num('PAPER_IDLE_EXIT_MIN', 10),
  },
  killRule: {
    minTrades: num('KILL_MIN_TRADES', 50),
    windowTrades: num('KILL_WINDOW_TRADES', 200),
  },

  // ---- Alerts / ops ----
  telegram: {
    botToken: str('TELEGRAM_BOT_TOKEN', ''),
    chatId: str('TELEGRAM_CHAT_ID', ''),
    dailySummaryHour: num('DAILY_SUMMARY_HOUR', 8),
    timezone: str('TZ_NAME', 'America/Denver'),
  },
  dashboardPassword: str('DASHBOARD_PASSWORD', ''),
  healthcheckUrl: str('HEALTHCHECK_URL', ''), // e.g. https://hc-ping.com/<uuid>
  retention: {
    tradesDays: num('RETAIN_TRADES_DAYS', 14),
    snapshotsDays: num('RETAIN_SNAPSHOTS_DAYS', 90),
    walletsDays: num('RETAIN_WALLETS_DAYS', 30),
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
