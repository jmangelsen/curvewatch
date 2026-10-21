// H4: prospective long-horizon paper experiment, isolated from all existing books.
// No reconstructed holders, retroactive entries, trading APIs, or automatic promotion.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { db } from '../db.js';
import { CAPITAL_POLICY } from './capitalPolicy.js';

const MIN = 60000, HOUR = 60 * MIN;
export const LATE_RULE = Object.freeze({
  name: 'H4 late accumulation', ageMinH: 2, ageMaxH: 24,
  minMcapUsd: 30000, maxMcapUsd: 2000000, minLiqUsd: 25000,
  minHolders: 200, holderGrowthPct: 5, maxHolderStepLossPct: 2,
  minHourlyVolumeUsd: 10000, minHourlyBuys: 30, minBuyShare: 0.5,
  minLiqRetention: 0.8, minPriceHourRatio: 0.9, maxPriceHourRatio: 1.5,
  warmupH: 2, quoteFreshSec: 120, maxGapMin: 15, holderFreshMin: 75,
  sizeUsd: 50, bankrollPerArmUsd: 1000, maxOpenCohorts: 10,
  stopPct: 35, maxNetLossTriggerPct: CAPITAL_POLICY.maxStopPct, feePct: 1, slippagePct: 2, partialMultiple: 2,
  partialFraction: 0.5, trailPct: 30, horizons: [6, 12, 24, 36],
});
export const LATE_VERSION = createHash('sha256').update(JSON.stringify(LATE_RULE))
  .update(readFileSync(new URL(import.meta.url))).digest('hex').slice(0, 12);

export function initLate(store = db, now = Date.now()) {
  store.exec(`
    CREATE TABLE IF NOT EXISTS late_rules (version TEXT PRIMARY KEY, registered_at INTEGER NOT NULL, definition TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS late_observations (
      mint TEXT NOT NULL, ts INTEGER NOT NULL, price REAL NOT NULL, liq REAL NOT NULL,
      mcap REAL NOT NULL, vol1h REAL NOT NULL, buys INTEGER NOT NULL, sells INTEGER NOT NULL, pair TEXT,
      PRIMARY KEY(mint,ts));
    CREATE TABLE IF NOT EXISTS late_cohorts (
      id INTEGER PRIMARY KEY, version TEXT NOT NULL, mint TEXT NOT NULL, symbol TEXT,
      signal_at INTEGER NOT NULL, entry_at INTEGER NOT NULL, entry_price REAL NOT NULL,
      entry_liq REAL NOT NULL, pair TEXT NOT NULL, evidence TEXT NOT NULL,
      UNIQUE(version,mint));
    CREATE TABLE IF NOT EXISTS late_arms (
      cohort_id INTEGER NOT NULL, arm TEXT NOT NULL, horizon INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'open', remaining REAL NOT NULL, cash REAL NOT NULL DEFAULT 0,
      peak REAL NOT NULL, min_equity REAL NOT NULL, peak_equity REAL NOT NULL,
      max_drawdown REAL NOT NULL DEFAULT 0, last_at INTEGER NOT NULL, last_price REAL NOT NULL,
      partial INTEGER NOT NULL DEFAULT 0, capital_hours REAL NOT NULL DEFAULT 0,
      exit_at INTEGER, exit_reason TEXT, pnl REAL,
      PRIMARY KEY(cohort_id,arm));
    CREATE TABLE IF NOT EXISTS late_events (
      id INTEGER PRIMARY KEY, cohort_id INTEGER NOT NULL, arm TEXT NOT NULL,
      ts INTEGER NOT NULL, kind TEXT NOT NULL, price REAL, proceeds REAL, note TEXT);
    CREATE INDEX IF NOT EXISTS late_observations_time ON late_observations(ts);
  `);
  store.prepare('INSERT OR IGNORE INTO late_rules VALUES (?,?,?)').run(LATE_VERSION, now, JSON.stringify(LATE_RULE));
  return store.prepare('SELECT registered_at FROM late_rules WHERE version=?').get(LATE_VERSION).registered_at;
}

const finite = x => Number.isFinite(x);
const goodPoint = p => p && [p.t, p.price, p.liq, p.mcap].every(finite) && p.price > 0 && p.mcap > 0 && p.liq >= 0;
export function lateEligibility({ now, born, point: p, history = [], holders = [], rejected = false, pair, registeredAt }) {
  const R = LATE_RULE, reasons = [], metrics = {};
  if (rejected) reasons.push('existing safety reject');
  if (!pair) reasons.push('pool identity unavailable');
  if (!finite(born) || born > now || now - born < R.ageMinH * HOUR || now - born > R.ageMaxH * HOUR) reasons.push('outside 2–24h pool-age window');
  if (!goodPoint(p) || p.t > now || now - p.t > R.quoteFreshSec * 1000) return { pass: false, reasons: [...reasons, 'fresh USD quote unavailable'], metrics };
  if (p.mcap < R.minMcapUsd || p.mcap > R.maxMcapUsd) reasons.push('market cap outside $30k–$2m');
  if (p.liq < R.minLiqUsd) reasons.push('liquidity below $25k');
  const hist = history.filter(x => x.ts >= registeredAt && x.ts <= p.t && x.ts >= p.t - 3 * HOUR && x.pair === pair).sort((a,b) => a.ts-b.ts);
  const base = [...hist].reverse().find(x => x.ts <= p.t - 2 * HOUR);
  const hour = [...hist].reverse().find(x => x.ts <= p.t - HOUR);
  if (!base || p.t-base.ts > 2*HOUR+15*MIN || !hour || p.t-hour.ts > HOUR+15*MIN) reasons.push('needs 2h prospective price/liquidity coverage');
  else {
    const tape = hist.filter(x => x.ts >= base.ts);
    if (tape.length < 20 || tape.some((x,i) => i && x.ts-tape[i-1].ts > R.maxGapMin*MIN) || p.t-tape.at(-1).ts>R.maxGapMin*MIN) reasons.push('price coverage gap');
    metrics.liquidityRetention = p.liq/base.liq;
    metrics.priceHourRatio = p.price/hour.price;
    if (!(metrics.liquidityRetention >= R.minLiqRetention)) reasons.push('liquidity retention below 80%');
    if (metrics.priceHourRatio < R.minPriceHourRatio || metrics.priceHourRatio > R.maxPriceHourRatio) reasons.push('price not stabilizing, or already chasing');
    const demand = x => (x.vol1h ?? x.v1h) >= R.minHourlyVolumeUsd && (x.buys ?? x.b1h) >= R.minHourlyBuys &&
      (x.buys ?? x.b1h)/Math.max(1,(x.buys ?? x.b1h)+(x.sells ?? x.s1h)) >= R.minBuyShare;
    if (!demand(hour) || !demand(p)) reasons.push('demand not persistent across two hourly windows');
  }
  // Only new, exact unique-owner observations qualify. Legacy account counts and reconstructions never enter here.
  const hs = holders.filter(x => x.ts >= registeredAt && x.ts <= now && x.ts >= now-4*HOUR && x.method==='owners-v1' && x.capped===0 && x.holders>0).sort((a,b)=>a.ts-b.ts);
  const last = hs.at(-1), hb = last && [...hs].reverse().find(x=>x.ts<=last.ts-2*HOUR);
  if (!last || now-last.ts > R.holderFreshMin*MIN || !hb || last.ts-hb.ts>3*HOUR) reasons.push('needs fresh, uncapped 2h unique-holder history');
  else {
    const path=hs.filter(x=>x.ts>=hb.ts);
    metrics.holders=last.holders; metrics.holderGrowthPct=100*(last.holders/hb.holders-1);
    if (path.length<3 || path.some((x,i)=>i && x.ts-path[i-1].ts>90*MIN)) reasons.push('holder coverage gap');
    if (last.holders<R.minHolders || metrics.holderGrowthPct<R.holderGrowthPct) reasons.push('holder accumulation below 200 owners / +5%');
    if (path.some((x,i)=>i && x.holders/path[i-1].holders<1-R.maxHolderStepLossPct/100)) reasons.push('holder loss exceeds 2% between readings');
  }
  return { pass: !reasons.length, reasons, metrics };
}

// Conservative proxy fills at the first observed quote, never at an unobserved stop/target.
export function entryUnits(price, liq) {
  const r=LATE_RULE, reserve=Math.max(1,liq/2), impact=r.sizeUsd/(reserve+r.sizeUsd);
  return r.sizeUsd/(price*(1+(r.feePct+r.slippagePct)/100+impact));
}
export function sellValue(units, price, liq) {
  const gross=units*price, impact=gross/(Math.max(1,liq/2)+gross);
  return Math.max(0,gross*(1-(LATE_RULE.feePct+LATE_RULE.slippagePct)/100-impact));
}

export class LateAccumulation {
  constructor({ store=db, grads, now=Date.now(), holdersEnabled=false }={}) {
    this.db=store; this.grads=grads; this.holdersEnabled=holdersEnabled; this.registeredAt=initLate(store,now);
    this.pending=new Map(); this.diagnostics=[]; this.lastTick=null; this.error=null;
    // A fresh process cannot know the intervening path. Do not pretend the missing interval was a fill.
    const open=store.prepare("SELECT * FROM late_arms WHERE state='open'").all();
    for(const a of open) this.censor(a,now,'process restart: unobserved price path');
  }
  censor(a,now,reason) {
    this.db.prepare("UPDATE late_arms SET state='censored', exit_at=?, exit_reason=? WHERE cohort_id=? AND arm=? AND state='open'").run(now,reason,a.cohort_id,a.arm);
    this.db.prepare('INSERT INTO late_events(cohort_id,arm,ts,kind,note) VALUES(?,?,?,?,?)').run(a.cohort_id,a.arm,now,'censored',reason);
  }
  rejected(mint, st) {
    if(st?.reject || st?.creatorRugger) return true;
    return !!this.db.prepare("SELECT 1 FROM rejects WHERE mint=? LIMIT 1").get(mint);
  }
  observe(st, now) {
    const p=st.last; if(!goodPoint(p) || p.t>now || now-p.t>120000) return;
    const last=this.db.prepare('SELECT ts FROM late_observations WHERE mint=? ORDER BY ts DESC LIMIT 1').get(st.mint);
    if(!last || p.t-last.ts>=5*MIN) this.db.prepare('INSERT OR IGNORE INTO late_observations VALUES(?,?,?,?,?,?,?,?,?)')
      .run(st.mint,p.t,p.price,p.liq,p.mcap,p.v1h||0,p.b1h||0,p.s1h||0,st.pair||null);
  }
  qualify(st,now) {
    const history=this.db.prepare('SELECT * FROM late_observations WHERE mint=? AND ts>=? ORDER BY ts').all(st.mint,now-3*HOUR);
    const holders=this.db.prepare('SELECT * FROM holder_history WHERE mint=? AND ts>=? ORDER BY ts').all(st.mint,now-4*HOUR);
    return lateEligibility({now,born:st.pairCreatedAt,point:st.last,history,holders,rejected:this.rejected(st.mint,st),pair:st.pair,registeredAt:this.registeredAt});
  }
  enter(st, signal, evidence) {
    const p=st.last, r=LATE_RULE;
    this.db.transaction(()=>{
      const result=this.db.prepare('INSERT OR IGNORE INTO late_cohorts(version,mint,symbol,signal_at,entry_at,entry_price,entry_liq,pair,evidence) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(LATE_VERSION,st.mint,st.symbol||st.mint.slice(0,8),signal,p.t,p.price,p.liq,st.pair,JSON.stringify(evidence));
      if(!result.changes) return;
      const id=Number(result.lastInsertRowid), units=entryUnits(p.price,p.liq), eq=sellValue(units,p.price,p.liq);
      for(const [arm,h] of [...r.horizons.map(h=>[`${h}h`,h]),['managed36h',36]]) {
        this.db.prepare('INSERT INTO late_arms(cohort_id,arm,horizon,remaining,peak,min_equity,peak_equity,last_at,last_price) VALUES(?,?,?,?,?,?,?,?,?)')
          .run(id,arm,h,units,p.price,eq,r.sizeUsd,p.t,p.price);
        this.db.prepare('INSERT INTO late_events(cohort_id,arm,ts,kind,price,note) VALUES(?,?,?,?,?,?)')
          .run(id,arm,p.t,'entry',p.price,'$50 independent paper arm; fee, slippage and pool-impact proxy');
      }
    })();
  }
  advance(a,c,st,now) {
    const p=st?.last, r=LATE_RULE;
    if(!goodPoint(p) || p.t<=a.last_at) {
      if(now-a.last_at>r.maxGapMin*MIN) this.censor(a,now,'quote missing or watch removed');
      return;
    }
    if(p.t>now || now-p.t>120000) return;
    if(p.t-a.last_at>r.maxGapMin*MIN || st.pair!==c.pair) return this.censor(a,now,st.pair!==c.pair?'pool changed':'quote gap exceeds 15 minutes');
    a.capital_hours+=r.sizeUsd*(p.t-a.last_at)/HOUR;
    a.peak=Math.max(a.peak,p.price);
    const eq=a.cash+sellValue(a.remaining,p.price,p.liq);
    a.min_equity=Math.min(a.min_equity,eq); a.peak_equity=Math.max(a.peak_equity,eq);
    a.max_drawdown=Math.max(a.max_drawdown,1-eq/a.peak_equity);
    let reason = this.rejected(c.mint,st) ? 'new safety reject' : p.liq<Math.max(10000,c.entry_liq*0.5) ? 'liquidity deterioration' :
      eq <= r.sizeUsd*(1-r.maxNetLossTriggerPct/100) ? 'observed net loss ceiling -47% (not guaranteed fill)' :
      p.price<=c.entry_price*(1-r.stopPct/100) ? 'observed stop' :
      a.arm==='managed36h' && a.partial && p.price<=a.peak*(1-r.trailPct/100) ? 'observed runner trail' :
      p.t>=c.entry_at+a.horizon*HOUR ? 'time exit' : null;
    this.db.transaction(()=>{
      if(!reason && a.arm==='managed36h' && !a.partial && p.price>=c.entry_price*r.partialMultiple) {
        const sell=a.remaining*r.partialFraction, cash=sellValue(sell,p.price,p.liq);
        a.remaining-=sell; a.cash+=cash; a.partial=1;
        this.db.prepare('INSERT INTO late_events(cohort_id,arm,ts,kind,price,proceeds) VALUES(?,?,?,?,?,?)').run(c.id,a.arm,p.t,'partial',p.price,cash);
      }
      if(reason) {
        const cash=sellValue(a.remaining,p.price,p.liq); a.cash+=cash; a.remaining=0;
        this.db.prepare('INSERT INTO late_events(cohort_id,arm,ts,kind,price,proceeds,note) VALUES(?,?,?,?,?,?,?)').run(c.id,a.arm,p.t,'exit',p.price,cash,reason);
      }
      this.db.prepare(`UPDATE late_arms SET remaining=?,cash=?,peak=?,min_equity=?,peak_equity=?,max_drawdown=?,last_at=?,last_price=?,partial=?,capital_hours=?,state=?,exit_at=?,exit_reason=?,pnl=? WHERE cohort_id=? AND arm=?`)
        .run(a.remaining,a.cash,a.peak,a.min_equity,a.peak_equity,a.max_drawdown,p.t,p.price,a.partial,a.capital_hours,reason?'closed':'open',reason?p.t:null,reason,reason?a.cash-r.sizeUsd:null,c.id,a.arm);
    })();
  }
  tick(now=Date.now()) {
    this.lastTick=now;
    const open=this.db.prepare("SELECT * FROM late_arms WHERE state='open'").all();
    for(const a of open) {
      const c=this.db.prepare('SELECT * FROM late_cohorts WHERE id=?').get(a.cohort_id);
      this.advance(a,c,this.grads.watch.get(c.mint),now);
    }
    this.grads.lateProtected=new Set(this.db.prepare("SELECT DISTINCT c.mint FROM late_cohorts c JOIN late_arms a ON a.cohort_id=c.id WHERE a.state='open'").all().map(x=>x.mint));
    let openN=this.grads.lateProtected.size;
    const rows=[];
    for(const st of this.grads.watch.values()) {
      if(!st.pairCreatedAt || now-st.pairCreatedAt>24*HOUR || now-st.pairCreatedAt< HOUR || !st.last || st.last.mcap<30000 || st.last.liq<15000) continue;
      this.observe(st,now);
      const e=this.qualify(st,now);
      if(!this.holdersEnabled && !e.reasons.includes('holder provider not configured')) { e.pass=false; e.reasons.push('holder provider not configured'); }
      const seen=this.db.prepare('SELECT id FROM late_cohorts WHERE version=? AND mint=?').get(LATE_VERSION,st.mint);
      const pending=this.pending.get(st.mint);
      if(!e.pass) this.pending.delete(st.mint);
      else if(!seen && openN< LATE_RULE.maxOpenCohorts) {
        if(!pending || now-pending.signal>2*MIN) this.pending.set(st.mint,{signal:now,point:st.last.t});
        else if(st.last.t>pending.point && now-pending.signal>=30000) {
          this.enter(st,pending.signal,e); this.pending.delete(st.mint); openN++;
          this.grads.lateProtected.add(st.mint);
        }
      }
      rows.push({mint:st.mint,symbol:st.symbol||st.mint.slice(0,8),mcap:st.last.mcap,liq:st.last.liq,...e,state:seen?'already enrolled':!e.pass?'blocked':openN>=LATE_RULE.maxOpenCohorts?'capacity limit':'qualifying / awaiting next quote'});
    }
    this.diagnostics=rows.sort((a,b)=>Number(b.pass)-Number(a.pass)||a.reasons.length-b.reasons.length);
    // Observation history is new research data; retain it. No destructive pruning here.
  }
  start() {
    const run=()=>{try{this.tick();this.error=null;}catch(e){this.error=e.message;}};
    this.timer=setInterval(run,60000); this.timer.unref?.(); run();
  }
  stop() { clearInterval(this.timer); }
  priorityMints() { return [...(this.grads.lateProtected||[]),...this.diagnostics.filter(x=>!x.reasons.some(r=>/reject/.test(r))).slice(0,8).map(x=>x.mint)]; }
  view() {
    const cohorts=this.db.prepare('SELECT * FROM late_cohorts WHERE version=? ORDER BY entry_at DESC').all(LATE_VERSION);
    const arms=this.db.prepare('SELECT a.* FROM late_arms a JOIN late_cohorts c ON c.id=a.cohort_id WHERE c.version=?').all(LATE_VERSION);
    const avg=xs=>xs.length?xs.reduce((s,v)=>s+v,0)/xs.length:null;
    const median=xs=>{const a=[...xs].sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null;};
    const horizon=[...LATE_RULE.horizons.map(h=>`${h}h`),'managed36h'].map(arm=>{
      const a=arms.filter(x=>x.arm===arm), closed=a.filter(x=>x.state==='closed'), censored=a.filter(x=>x.state==='censored');
      const pairs=closed.map(x=>({x,b:arms.find(b=>b.cohort_id===x.cohort_id&&b.arm==='6h'&&b.state==='closed')})).filter(x=>x.b);
      const conservative=[...closed.map(x=>x.pnl),...censored.map(()=>-LATE_RULE.sizeUsd)];
      return {arm,open:a.filter(x=>x.state==='open').length,closed:closed.length,censored:censored.length,meanUsd:avg(closed.map(x=>x.pnl)),medianUsd:median(closed.map(x=>x.pnl)),
        worstDrawdownPct:closed.length?Math.max(...closed.map(x=>x.max_drawdown))*100:null,
        returnPerDollarHour:closed.length?closed.reduce((s,x)=>s+x.pnl,0)/Math.max(1,closed.reduce((s,x)=>s+x.capital_hours,0)):null,
        pairs:pairs.length,pairedMeanUsd:avg(pairs.map(({x,b})=>x.pnl-b.pnl)),missingAsTotalLossUsd:avg(conservative)};
    });
    return {version:LATE_VERSION,registeredAt:this.registeredAt,rule:LATE_RULE,status:this.holdersEnabled?'forward paper research':'blocked: holder provider not configured',error:this.error,lastTick:this.lastTick,
      verdict:'Unvalidated. No automatic promotion or live execution; descriptive paired results only.',
      horizon,cohorts:cohorts.slice(0,100).map(c=>({...c,evidence:JSON.parse(c.evidence),arms:arms.filter(a=>a.cohort_id===c.id)})),cohortCount:cohorts.length,
      candidates:this.diagnostics.slice(0,40),candidateCount:this.diagnostics.length,
      caveats:['Holder readings must be observed unique owners, never reconstructed or capped counts.','Missing quotes, restarts and pool switches are censored, never treated as zero-return exits.','No after-cost result is executable: fills use sampled USD quotes and modeled fees, slippage and impact.','Non-SOL curve rejects remain blocked under the existing safety policy.']};
  }
  detail(id) {
    const c=this.db.prepare('SELECT * FROM late_cohorts WHERE id=? AND version=?').get(id,LATE_VERSION);
    if(!c) return null;
    return {...c,evidence:JSON.parse(c.evidence),arms:this.db.prepare('SELECT * FROM late_arms WHERE cohort_id=?').all(id),events:this.db.prepare('SELECT * FROM late_events WHERE cohort_id=? ORDER BY ts,id').all(id)};
  }
}
