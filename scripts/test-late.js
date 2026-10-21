import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'late-test-'));
const {default:Database}=await import('better-sqlite3');
const {LateAccumulation,lateEligibility,LATE_RULE,LATE_VERSION,entryUnits,sellValue}=await import('../src/engine/lateAccumulation.js');
const M=60000,H=60*M,N=Date.now();
let count=0;
const test=(label,fn)=>{fn();console.log('ok',label);count++;};
function input(now=N) {
  const history=Array.from({length:27},(_,i)=>({mint:'mint',ts:now-(26-i)*5*M,price:1,liq:100000,mcap:100000,vol1h:20000,buys:100,sells:80,pair:'pool'}));
  return {now,born:now-5*H,point:{t:now,price:1,liq:100000,mcap:100000,v1h:20000,b1h:100,s1h:80},history,
    holders:[{ts:now-2*H,holders:300},{ts:now-H,holders:315},{ts:now,holders:330}].map(x=>({...x,capped:0,method:'owners-v1'})),
    rejected:false,pair:'pool',registeredAt:now-3*H};
}
function fixture(enabled=true) {
  const store=new Database(':memory:'); store.exec("CREATE TABLE rejects(mint TEXT,reason TEXT); CREATE TABLE holder_history(mint TEXT,ts INTEGER,holders INTEGER,capped INTEGER,method TEXT)");
  const x=input(), st={mint:'mint',symbol:'TEST',pair:'pool',pairCreatedAt:x.born,last:x.point};
  const grads={watch:new Map([['mint',st]])}, engine=new LateAccumulation({store,grads,now:N-3*H,holdersEnabled:enabled});
  const ins=store.prepare('INSERT INTO late_observations VALUES(@mint,@ts,@price,@liq,@mcap,@vol1h,@buys,@sells,@pair)');
  for(const p of x.history)ins.run(p);
  for(const h of x.holders)store.prepare('INSERT INTO holder_history VALUES(?,?,?,?,?)').run('mint',h.ts,h.holders,h.capped,h.method);
  return {store,st,grads,engine};
}
function enroll(f) { f.engine.tick(N); f.st.last={...f.st.last,t:N+M}; f.engine.tick(N+M); }
test('all prospective gates pass on complete observed evidence',()=>assert.equal(lateEligibility(input()).pass,true));
test('missing, legacy, capped and future holder readings cannot qualify',()=>{
  for(const transform of [()=>[],h=>h.map(x=>({...x,method:'legacy-accounts'})),h=>h.map(x=>({...x,capped:1})),h=>h.map(x=>({...x,ts:x.ts+6*H}))]) {
    const x=input(); x.holders=transform(x.holders); assert.equal(lateEligibility(x).pass,false);
  }
});
test('safety rejects, stale quotes, future quotes, wrong pools and gaps fail closed',()=>{
  for(const mutation of [x=>x.rejected=true,x=>x.point.t-=3*M,x=>x.point.t+=M,x=>x.pair='changed',x=>x.history.splice(5,6),x=>x.point.price=NaN,x=>x.point.liq=0]) {
    const x=input();mutation(x);assert.equal(lateEligibility(x).pass,false);
  }
});
test('registration prevents lookback from before the rule existed',()=>{
  const x=input();x.registeredAt=N;assert.equal(lateEligibility(x).pass,false);
});
test('price chase, demand collapse and holder outflow do not qualify',()=>{
  for(const mutation of [x=>x.point.price=2,x=>x.point.v1h=100,x=>x.holders[1].holders=400,x=>x.point.liq=50000]) {
    const x=input();mutation(x);assert.equal(lateEligibility(x).pass,false);
  }
});
test('costs reduce entry and proceeds and slippage worsens for smaller pools',()=>{
  assert.ok(entryUnits(1,100000)<50);assert.ok(sellValue(50,1,100000)<50);assert.ok(sellValue(50,1,1000)<sellValue(50,1,100000));
});
test('missing provider records observations, never a paper trade',()=>{
  const f=fixture(false);enroll(f);assert.equal(f.store.prepare('SELECT count(*) n FROM late_cohorts').get().n,0);
  assert.match(f.engine.view().status,/blocked/);
});
test('signal waits for next quote, rechecks, then creates exactly five arms once',()=>{
  const f=fixture();f.engine.tick(N);assert.equal(f.engine.view().cohortCount,0);
  f.engine.tick(N+M);assert.equal(f.engine.view().cohortCount,0);
  f.st.last={...f.st.last,t:N+M};f.engine.tick(N+M);
  assert.equal(f.engine.view().cohortCount,1);assert.equal(f.store.prepare('SELECT count(*) n FROM late_arms').get().n,5);
  f.engine.tick(N+M);assert.equal(f.engine.view().cohortCount,1);
});
test('reject added during entry delay blocks all entries',()=>{
  const f=fixture();f.engine.tick(N);f.store.prepare('INSERT INTO rejects VALUES(?,?)').run('mint','risk');
  f.st.last.t=N+M;f.engine.tick(N+M);assert.equal(f.engine.view().cohortCount,0);
});
test('gap-down exit uses observed quote, not the ideal stop price',()=>{
  const f=fixture();enroll(f);f.st.last={...f.st.last,t:N+2*M,price:0.4};f.engine.tick(N+2*M);
  const arms=f.store.prepare('SELECT * FROM late_arms').all();assert.ok(arms.every(a=>a.state==='closed'&&a.pnl < -30));
  assert.ok(f.store.prepare("SELECT price FROM late_events WHERE kind='exit'").all().every(x=>x.price===0.4));
});
test('missing watch is censored and conservative-loss sensitivity remains visible',()=>{
  const f=fixture();enroll(f);f.grads.watch.clear();f.engine.tick(N+20*M);
  assert.equal(f.engine.view().horizon[0].censored,1);
  assert.equal(f.engine.view().horizon[0].missingAsTotalLossUsd,-50);
  assert.equal(f.engine.view().horizon[0].meanUsd,null);
});
test('restart preserves registration and censors open paths rather than manufacturing exits',()=>{
  const f=fixture();enroll(f);const next=new LateAccumulation({store:f.store,grads:f.grads,now:N+2*M,holdersEnabled:true});
  assert.equal(next.registeredAt,N-3*H);assert.equal(next.view().horizon[0].censored,1);assert.equal(next.view().cohortCount,1);
});
test('managed arm takes partial once and exits the runner on observed trail',()=>{
  const f=fixture();enroll(f);f.st.last={...f.st.last,t:N+2*M,price:2.1};f.engine.tick(N+2*M);
  let a=f.store.prepare("SELECT * FROM late_arms WHERE arm='managed36h'").get();
  assert.equal(a.partial,1);assert.ok(a.cash>0&&a.remaining>0);
  f.st.last={...f.st.last,t:N+3*M,price:1.4};f.engine.tick(N+3*M);
  a=f.store.prepare("SELECT * FROM late_arms WHERE arm='managed36h'").get();assert.equal(a.exit_reason,'observed runner trail');
  assert.equal(f.store.prepare("SELECT count(*) n FROM late_events WHERE kind='partial'").get().n,1);
});
test('all fixed horizons mature from the same entries with correct paired differences',()=>{
  const f=fixture();enroll(f);
  for(let t=N+11*M;t<=N+36*H+11*M;t+=10*M) {
    f.st.last={...f.st.last,t,price:1.1};
    f.engine.tick(t);
  }
  const v=f.engine.view();assert.ok(v.horizon.every(h=>h.closed===1&&h.censored===0));
  assert.equal(v.horizon.find(h=>h.arm==='36h').pairs,1);
  assert.equal(v.horizon.find(h=>h.arm==='36h').pairedMeanUsd,0);
});
test('pool switch is censored, and liquidity deterioration exits instead of disappearing',()=>{
  const f=fixture();enroll(f);f.st.pair='other';f.st.last.t=N+2*M;f.engine.tick(N+2*M);
  assert.equal(f.engine.view().horizon[0].censored,1);
  const g=fixture();enroll(g);g.st.last={...g.st.last,t:N+2*M,liq:100};g.engine.tick(N+2*M);
  assert.equal(g.engine.view().horizon[0].closed,1);assert.equal(g.engine.detail(1).arms[0].exit_reason,'liquidity deterioration');
});
test('new experiment version is independent of legacy books',()=>{
  assert.equal(LATE_VERSION.length,12);assert.deepEqual(LATE_RULE.horizons,[6,12,24,36]);
});
console.log(`${count} late accumulation tests passed`);
