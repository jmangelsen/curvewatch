// Read-only historical overlay audit. No imports of application config or live .env.
// Earlier exits are compared over the ORIGINAL Main holding window, not an invented future path.
import Database from 'better-sqlite3';
import { curveSell } from '../src/util.js';
import { capitalAction, cappedStop, CAPITAL_POLICY } from '../src/engine/capitalPolicy.js';
const store = new Database(process.argv[2] || 'data/curvewatch.db', { readonly: true, fileMustExist: true });
const feePct = 1.25, slipPct = 3, delayMs = 2000;
const rows = store.prepare(`SELECT * FROM paper_trades WHERE status='closed' AND book='main'
  AND cfg='96f45eab' AND COALESCE(gap,0)=0 AND COALESCE(gated,0)=0 ORDER BY entry_ts,id`).all();
const path = store.prepare('SELECT ts,vsol,vtok FROM trades WHERE mint=? AND ts>? AND ts<=? ORDER BY ts,slot,rowid');
const initial = store.prepare('SELECT ts,vsol,vtok FROM trades WHERE mint=? AND ts<=? ORDER BY ts DESC,rowid DESC LIMIT 1');
const avg = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : null;
function stat(a) {
  const mean=avg(a), se=a.length>1?Math.sqrt(a.reduce((s,x)=>s+(x-mean)**2,0)/(a.length-1)/a.length):null;
  return {n:a.length,mean,lo:se==null?null:mean-1.96*se,hi:se==null?null:mean+1.96*se};
}
function replay(r,tape,start,rule) {
  let left=r.tokens,cash=0,peak=r.size_sol,stage=0,pending=null,q=start;
  const value = units => curveSell(q.vsol,q.vtok,units,feePct)*(1-slipPct/100);
  const mark = () => (cash+value(left))/r.size_sol;
  const finish = (reason,t) => ({pct:(cash+value(left)-r.size_sol)/r.size_sol*100,reason,t});
  const points=[...tape,{...tape.at(-1)||start,ts:r.exit_ts}];
  let nextTick=r.entry_ts+1000, pointer=0;
  while(pointer<points.length) {
    const event=points[pointer], tick=nextTick<event.ts, t=tick?nextTick:event.ts;
    if(tick) nextTick+=1000; else {q=event;pointer++;}
    if(!(q?.vsol>0 && q?.vtok>0)) return null;
    const mult=mark(); peak=Math.max(peak,cash+value(left));
    if(pending) {
      if(rule && pending.kind==='tp' && mult<=1-cappedStop(r.stop_pct??38.5)/100) {
        pending.kind='exit'; pending.reason='stop during pending profit order';
      }
      if(t>=pending.at) {
        if(pending.kind==='exit') return finish(pending.reason,t);
        const amount=left*(pending.fraction??1);
        cash+=value(amount);left-=amount;stage++;pending=null;
        if(left<=1e-9) return {pct:(cash/r.size_sol-1)*100,reason:'target filled',t};
      }
      if(t>=r.exit_ts) break;
      continue;
    }
    let action;
    if(rule) action=capitalAction({multiple:mult,peakMultiple:peak/r.size_sol,stage,remainingFraction:left/r.tokens,stopPct:r.stop_pct??38.5},rule);
    else if(mult>=r.tp_mult) action={kind:'tp',fraction:1,reason:'original target'};
    else if(mult<=1-(r.stop_pct??38.5)/100) action={kind:'exit',reason:'original stop'};
    if(action) pending={...action,at:t+delayMs};
    if(t>=r.exit_ts) break;
  }
  return finish('original Main terminal window',r.exit_ts);
}
const variants=[10,15,20].map(p=>({...CAPITAL_POLICY,id:`bank50_at${p}`,firstTarget:1+p/100,secondTarget:1+(p+10)/100}));
const details=[], excluded={missingTape:0,replayMismatch:0};
for(const r of rows) {
  const tape=path.all(r.mint,r.entry_ts,r.exit_ts),start=initial.get(r.mint,r.entry_ts);
  if(!start||!tape.length) {excluded.missingTape++;continue;}
  const base=replay(r,tape,start,null);
  if(!base||Math.abs(base.pct-r.pnl_pct)>5) {excluded.replayMismatch++;continue;}
  details.push({id:r.id,mint:r.mint,symbol:r.symbol,entry:r.entry_ts,actualPct:r.pnl_pct,baselinePct:base.pct,
    peakPct:(r.peak_value/r.size_sol-1)*100,variants:Object.fromEntries(variants.map(v=>[v.id,replay(r,tape,start,v)]))});
}
const half=Math.floor(details.length/2);
const result={generatedAt:new Date().toISOString(),baselineCfg:'96f45eab',parameters:{feePct,slipPct,delayMs,replayTolerancePoints:5},
  caveats:['Exploratory historical overlay, not forward validation.','All exits use observed reserves and a 2-second delay; no fills at theoretical stop prices.',
    'Any remaining position is liquidated at the original Main exit time. This does not simulate a longer-lived runner.',
    'Only Main trades are independent entries here; duplicate strategy books are not pooled.',
    'Chronological halves are diagnostics after inspecting the overall dataset, not an untouched holdout.'],
  sourceN:rows.length,excluded,matchedN:details.length,baseline:stat(details.map(x=>x.actualPct)),
  variants:variants.map(v=>({rule:v,all:stat(details.map(x=>x.variants[v.id].pct)),delta:stat(details.map(x=>x.variants[v.id].pct-x.baselinePct)),
    firstHalf:stat(details.slice(0,half).map(x=>x.variants[v.id].pct-x.baselinePct)),
    secondHalf:stat(details.slice(half).map(x=>x.variants[v.id].pct-x.baselinePct)),
    gaveBack:details.filter(x=>x.variants[v.id].pct<0&&x.peakPct>=10).length,
    worse47:details.filter(x=>x.variants[v.id].pct < -47).length})),details};
console.log(JSON.stringify(result));
store.close();
