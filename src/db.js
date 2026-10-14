// SQLite (WAL) storage. Single-user, single-process, zero-ops: one file to back up.
// The labeled dataset (tokens + snapshots + outcomes + wallet history) is the long-term asset.
import Database from 'better-sqlite3';
import { config } from './config.js';

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS tokens (
  mint TEXT PRIMARY KEY, name TEXT, symbol TEXT, uri TEXT, creator TEXT,
  created_at INTEGER NOT NULL, create_slot INTEGER, initial_buy_sol REAL, initial_mcap REAL,
  has_twitter INTEGER, has_telegram INTEGER, has_website INTEGER, mayhem INTEGER, pool TEXT,
  peak_mcap_1h REAL, mcap_1h REAL, graduated INTEGER DEFAULT 0, graduated_at INTEGER,
  rugged INTEGER, unique_buyers_1h INTEGER, max_score REAL, alerted INTEGER DEFAULT 0, finalized INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tokens_created ON tokens(created_at);
CREATE INDEX IF NOT EXISTS idx_tokens_creator ON tokens(creator);

CREATE TABLE IF NOT EXISTS snapshots (
  mint TEXT NOT NULL, checkpoint INTEGER NOT NULL, ts INTEGER NOT NULL, mcap REAL, score REAL,
  reject TEXT, features TEXT,
  max_mcap_after REAL, min_before_max REAL, min_mcap_after REAL, mcap_at_horizon REAL, graduated_after INTEGER,
  PRIMARY KEY (mint, checkpoint)
);
CREATE INDEX IF NOT EXISTS idx_snap_ts ON snapshots(ts);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, mint TEXT NOT NULL, ts INTEGER NOT NULL, score REAL, mcap REAL,
  age_sec REAL, progress REAL, reasons TEXT, flags TEXT, features TEXT,
  max_mcap_1h REAL, min_before_max REAL, mcap_1h REAL, graduated INTEGER, max_multiple REAL,
  dex_mcap_6h REAL, dex_mcap_24h REAL, finalized INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts);

CREATE TABLE IF NOT EXISTS trades (
  mint TEXT NOT NULL, ts INTEGER NOT NULL, slot INTEGER, sig TEXT, wallet TEXT, is_buy INTEGER,
  sol REAL, tok REAL, vsol REAL, vtok REAL
);
CREATE INDEX IF NOT EXISTS idx_trades_mint ON trades(mint, ts);

CREATE TABLE IF NOT EXISTS paper_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT, alert_id INTEGER, mint TEXT, symbol TEXT, status TEXT,
  entry_ts INTEGER, entry_mcap REAL, size_sol REAL, tokens REAL, tokens_left REAL, realized_sol REAL DEFAULT 0,
  peak_value REAL, exit_ts INTEGER, exit_reason TEXT, pnl_sol REAL, pnl_pct REAL, events TEXT
);

CREATE TABLE IF NOT EXISTS creators (
  wallet TEXT PRIMARY KEY, launches INTEGER DEFAULT 0, graduations INTEGER DEFAULT 0, rugs INTEGER DEFAULT 0,
  best_peak_mcap REAL DEFAULT 0, first_seen INTEGER, last_seen INTEGER
);

CREATE TABLE IF NOT EXISTS wallets (
  wallet TEXT PRIMARY KEY, early_buys INTEGER DEFAULT 0, wins INTEGER DEFAULT 0, graduations INTEGER DEFAULT 0,
  first_seen INTEGER, last_seen INTEGER
);

CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
`);

// Paper-book migrations: book (main | band), exit-rule version, market-gate tag, entry score, market context JSON.
for (const col of ["book TEXT DEFAULT 'main'", "rules TEXT DEFAULT 'v1'", 'gated INTEGER DEFAULT 0', 'score REAL', 'market TEXT']) {
  try { db.exec(`ALTER TABLE paper_trades ADD COLUMN ${col}`); } catch { /* exists */ }
}

export const q = {
  insertToken: db.prepare(`INSERT OR IGNORE INTO tokens (mint,name,symbol,uri,creator,created_at,create_slot,initial_buy_sol,initial_mcap,mayhem,pool)
    VALUES (@mint,@name,@symbol,@uri,@creator,@created_at,@create_slot,@initial_buy_sol,@initial_mcap,@mayhem,@pool)`),
  updateSocial: db.prepare(`UPDATE tokens SET has_twitter=?, has_telegram=?, has_website=? WHERE mint=?`),
  updateInitialBuy: db.prepare(`UPDATE tokens SET initial_buy_sol=?, initial_mcap=? WHERE mint=?`),
  finalizeToken: db.prepare(`UPDATE tokens SET peak_mcap_1h=@peak, mcap_1h=@mcap, graduated=@grad, graduated_at=@gradAt,
    rugged=@rugged, unique_buyers_1h=@buyers, max_score=@maxScore, alerted=@alerted, finalized=1 WHERE mint=@mint`),
  markGraduated: db.prepare(`UPDATE tokens SET graduated=1, graduated_at=? WHERE mint=?`),

  insertSnapshot: db.prepare(`INSERT OR REPLACE INTO snapshots (mint,checkpoint,ts,mcap,score,reject,features)
    VALUES (@mint,@checkpoint,@ts,@mcap,@score,@reject,@features)`),
  finalizeSnapshot: db.prepare(`UPDATE snapshots SET max_mcap_after=@maxAfter, min_before_max=@minBeforeMax, min_mcap_after=@minAfter,
    mcap_at_horizon=@mcapH, graduated_after=@grad WHERE mint=@mint AND checkpoint=@checkpoint`),

  insertAlert: db.prepare(`INSERT INTO alerts (mint,ts,score,mcap,age_sec,progress,reasons,flags,features)
    VALUES (@mint,@ts,@score,@mcap,@age,@progress,@reasons,@flags,@features)`),
  finalizeAlert: db.prepare(`UPDATE alerts SET max_mcap_1h=@maxAfter, min_before_max=@minBeforeMax, mcap_1h=@mcapH,
    graduated=@grad, max_multiple=@maxMult, finalized=1 WHERE id=@id`),
  updateAlertDex: db.prepare(`UPDATE alerts SET dex_mcap_6h=COALESCE(@m6,dex_mcap_6h), dex_mcap_24h=COALESCE(@m24,dex_mcap_24h) WHERE id=@id`),
  recentAlerts: db.prepare(`SELECT a.*, t.name, t.symbol, t.creator FROM alerts a LEFT JOIN tokens t ON t.mint=a.mint ORDER BY a.ts DESC LIMIT ?`),

  insertTrade: db.prepare(`INSERT INTO trades (mint,ts,slot,sig,wallet,is_buy,sol,tok,vsol,vtok) VALUES (?,?,?,?,?,?,?,?,?,?)`),

  insertPaper: db.prepare(`INSERT INTO paper_trades (alert_id,mint,symbol,status,entry_ts,entry_mcap,size_sol,tokens,tokens_left,peak_value,events,book,rules,gated,score,market)
    VALUES (@alertId,@mint,@symbol,'open',@entryTs,@entryMcap,@sizeSol,@tokens,@tokens,@sizeSol,@events,@book,@rules,@gated,@score,@market)`),
  updatePaper: db.prepare(`UPDATE paper_trades SET status=@status, tokens_left=@tokensLeft, realized_sol=@realized, peak_value=@peakValue,
    exit_ts=@exitTs, exit_reason=@exitReason, pnl_sol=@pnlSol, pnl_pct=@pnlPct, events=@events WHERE id=@id`),
  voidPaper: db.prepare(`UPDATE paper_trades SET status='void', exit_ts=?, exit_reason='voided (state lost)' WHERE id=?`),
  openPapers: db.prepare(`SELECT * FROM paper_trades WHERE status='open'`),
  allPapers: db.prepare(`SELECT * FROM paper_trades ORDER BY id DESC LIMIT ?`),
  closedPapersAsc: db.prepare(`SELECT * FROM paper_trades WHERE status='closed' ORDER BY exit_ts ASC`),

  upsertCreatorLaunch: db.prepare(`INSERT INTO creators (wallet,launches,first_seen,last_seen) VALUES (?,1,?,?)
    ON CONFLICT(wallet) DO UPDATE SET launches=launches+1, last_seen=excluded.last_seen`),
  creatorOutcome: db.prepare(`UPDATE creators SET graduations=graduations+?, rugs=rugs+?, best_peak_mcap=MAX(best_peak_mcap, ?) WHERE wallet=?`),
  getCreator: db.prepare(`SELECT * FROM creators WHERE wallet=?`),
  topRuggers: db.prepare(`SELECT * FROM creators WHERE launches>=3 ORDER BY (graduations=0) DESC, launches DESC LIMIT ?`),
  topCreators: db.prepare(`SELECT * FROM creators WHERE graduations>0 ORDER BY graduations DESC, best_peak_mcap DESC LIMIT ?`),

  upsertWallet: db.prepare(`INSERT INTO wallets (wallet,early_buys,wins,graduations,first_seen,last_seen) VALUES (@w,1,@win,@grad,@t,@t)
    ON CONFLICT(wallet) DO UPDATE SET early_buys=early_buys+1, wins=wins+@win, graduations=graduations+@grad, last_seen=@t`),
  smartWallets: db.prepare(`SELECT wallet, early_buys, wins, graduations, first_seen, last_seen,
      CAST(wins AS REAL)/early_buys AS win_rate,
      early_buys / MAX(1.0, (last_seen-first_seen)/86400000.0) AS buys_per_day
    FROM wallets WHERE early_buys >= ? AND wins >= ? AND CAST(wins AS REAL)/early_buys >= ?`),

  getKv: db.prepare(`SELECT v FROM kv WHERE k=?`),
  setKv: db.prepare(`INSERT INTO kv (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`),
};

export const tx = (fn) => db.transaction(fn);

export function retention() {
  const d = 86400000, t = Date.now(), r = config.retention;
  db.prepare(`DELETE FROM trades WHERE ts < ?`).run(t - r.tradesDays * d);
  db.prepare(`DELETE FROM snapshots WHERE ts < ?`).run(t - r.snapshotsDays * d);
  db.prepare(`DELETE FROM wallets WHERE last_seen < ? AND wins = 0`).run(t - r.walletsDays * d);
  db.pragma('wal_checkpoint(TRUNCATE)');
}
