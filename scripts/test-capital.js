import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'cw-capital-test-'));
process.env.LOG_LEVEL='error';
let now=1800000000000; Date.now=()=>now;
const {capitalAction,cappedStop}=await import('../src/engine/capitalPolicy.js');
const {config}=await import('../src/config.js');
const {db}=await import('../src/db.js');
const p=await import('../src/engine/paper.js');
let n=0;
const test=(name,fn)=>{fn();n++;console.log('ok',name);};
test('ceiling never widens tighter stops',()=>{
  assert.equal(cappedStop(100),47); assert.equal(cappedStop(38.5),38.5);
  for(const s of Object.values(p.STRATEGIES)) assert.ok(s.stopPct<=47);
});
test('half at +10%, a quarter of original at +20%, no premature sale',()=>{
  const state={multiple:1.11,peakMultiple:1.11,stopPct:38.5,remainingFraction:1};
  assert.equal(capitalAction({...state,multiple:1.09}),null);
  assert.equal(capitalAction(state).fraction,.5);
  assert.equal(capitalAction({...state,stage:1,remainingFraction:.5,multiple:1.21,peakMultiple:1.21}).fraction,.5);
  assert.equal(capitalAction({...state,stage:2,remainingFraction:.25,multiple:1.21,peakMultiple:1.21}),null);
});
test('profit floor and trail require a filled partial; hard stop overrides them',()=>{
  assert.equal(capitalAction({multiple:1.01,peakMultiple:1.1,stage:0,stopPct:38.5}),null);
  assert.match(capitalAction({multiple:1.01,peakMultiple:1.1,stage:1,stopPct:38.5}).reason,/floor/);
  assert.match(capitalAction({multiple:1.05,peakMultiple:1.3,stage:1,stopPct:38.5}).reason,/trailing/);
  assert.match(capitalAction({multiple:.5,peakMultiple:1.3,stage:1,stopPct:100}).reason,/-47/);
});
const tokens=new Map();let ix=0;
function token() {
  const t={mint:`CAP${++ix}`.padEnd(44,'x'),symbol:'CAP',vsol:30,vtok:1e9,lastTradeAt:now,graduated:false,lastFeatures:{}};
  Object.defineProperty(t,'mcap',{get:()=>t.vsol/t.vtok*1e9});
  t.move=(mult)=>{let k=t.vsol*t.vtok;t.vsol*=Math.sqrt(mult);t.vtok=k/t.vsol;t.lastTradeAt=now;};
  tokens.set(t.mint,t);return t;
}
const get=m=>tokens.get(m), advance=s=>{now+=s*1000;}, row=(t,b='capital')=>db.prepare('SELECT * FROM paper_trades WHERE mint=? AND book=? ORDER BY id DESC LIMIT 1').get(t.mint,b);
const enter=(t,b='main')=>{p.scheduleEntry(t,null,{book:b,score:80});advance(config.paper.entryDelaySec+.1);p.tick(get);};
test('Main and capital share entry timestamp, tokens, size and rejection gate',()=>{
  const t=token();enter(t);
  assert.equal(row(t).entry_ts,row(t,'main').entry_ts);
  assert.equal(row(t).tokens,row(t,'main').tokens);
  const bad=token();bad.rejectedHard={reason:'safety reject'};enter(bad);
  assert.equal(row(bad).status,'skipped');assert.equal(row(bad).size_sol,0);
  t.graduated=true;p.onTrade(t.mint);
});
test('two partials bank exactly 50% then 25% of original tokens',()=>{
  const t=token();enter(t);const original=row(t).tokens;
  t.move(1.3);p.onTrade(t.mint);assert.equal(row(t).realized_sol,0);
  advance(config.paper.exitDelaySec+.1);p.onTrade(t.mint);
  assert.ok(Math.abs(row(t).tokens_left/original-.5)<1e-10);
  t.move(1.5);p.onTrade(t.mint);advance(config.paper.exitDelaySec+.1);p.onTrade(t.mint);
  assert.ok(Math.abs(row(t).tokens_left/original-.25)<1e-10);
  t.graduated=true;p.onTrade(t.mint);
});
test('profit order becomes a full exit on a dump, loss is not fabricated at 47%',()=>{
  const t=token();enter(t);t.move(1.3);p.onTrade(t.mint);
  t.move(.1);p.onTrade(t.mint);advance(config.paper.exitDelaySec+.1);p.onTrade(t.mint);
  const r=row(t);assert.equal(r.status,'closed');assert.equal(r.tokens_left,0);
  assert.match(r.exit_reason,/stop/);assert.ok(r.pnl_pct < -47,'report the real bad fill');
});
test('timed book now stops at or before 47%, despite its old no-stop design',()=>{
  const t=token();enter(t,'timed');assert.equal(row(t,'timed').stop_pct,47);
  t.move(.45);p.onTrade(t.mint);advance(config.paper.exitDelaySec+.1);p.onTrade(t.mint);
  assert.equal(row(t,'timed').status,'closed');assert.match(row(t,'timed').exit_reason,/-47/);
});
test('restored partially sold capital trade resumes at stage one, not stage zero',()=>{
  const t=token(),size=config.paper.sizeSol,units=1e6;
  const res=db.prepare(`INSERT INTO paper_trades(mint,symbol,status,entry_ts,entry_mcap,size_sol,tokens,tokens_left,realized_sol,peak_value,book,stop_pct,events)
    VALUES(?,?,'open',?,?,?,?,?,?,?,'capital',38.5,?)`).run(t.mint,'RESTORE',now,t.mcap,size,units,units*.5,size*.55,size*1.1,JSON.stringify([{t:now,type:'entry'},{t:now,type:'tp1',sol:size*.55}]));
  p.restoreOpen(get,{downSec:0});
  // With value far below the loss trigger it should exit the remaining position, not bank another first partial.
  p.onTrade(t.mint);advance(config.paper.exitDelaySec+.1);p.onTrade(t.mint);
  assert.equal(db.prepare('SELECT status FROM paper_trades WHERE id=?').get(res.lastInsertRowid).status,'closed');
});
console.log(`${n} capital protection tests passed`);
db.close();fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true});
