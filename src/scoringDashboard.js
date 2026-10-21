// Read-only research measurements. Never imports or writes strategy weights.
import { config } from './config.js';
export function measureScoringToken(t, { now=Date.now(), solUsd, largeUsd=250, windowMin=5 }={}) {
  const tr=(t.trades||[]).filter(x=>x.at>=now-windowMin*60000 && x.at<=now && x.sol>0);
  const buys=tr.filter(x=>x.b), buySol=buys.reduce((s,x)=>s+x.sol,0);
  const px=Number.isFinite(solUsd)&&solUsd>0?solUsd:null;
  const large=px?buys.filter(x=>x.sol*px>=largeUsd):[];
  const bals=[...(t.holders?.values()||[])].filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>b-a);
  const held=bals.reduce((s,x)=>s+x,0);
  const usable=t.quoteOk===true&&!t.lite&&!t.gap;
  const buyShare=usable&&px&&buySol>0?100*large.reduce((s,x)=>s+x.sol,0)/buySol:null;
  const impact=usable&&t.vsol>0&&t.vtok>0?100*((1+1/t.vsol)**2-1):null;
  const concentration=usable&&held>0?100*bals.slice(0,10).reduce((s,x)=>s+x,0)/held:null;
  const reasons=[];
  if(!usable)reasons.push(t.lite?'trade detail released':!t.quoteOk?'unsupported quote':'feed gap');
  if(!px)reasons.push('USD conversion unavailable');
  if(tr.length<20)reasons.push('fewer than 20 recent trades');
  if(!t.lastTradeAt||now-t.lastTradeAt>60000)reasons.push('last trade older than 60 seconds');
  if((t.trades?.length||0)>=config.lifecycle.maxTradesPerToken)reasons.push('trade tape limit reached');
  const reject=typeof t.rejectedHard==='string'?t.rejectedHard:t.rejectedHard?.reason||t.lastScore?.reject||null;
  return {mint:t.mint,symbol:t.symbol||t.mint.slice(0,6),name:t.name||'',createdAt:t.createdAt,ageSec:Math.max(0,(now-t.createdAt)/1000),
    marketCapUsd:px&&usable&&Number.isFinite(t.mcap)?t.mcap*px:null,
    largeBuyShare:buyShare,impactPerSol:impact,concentration,buyVolumeUsd:px&&usable?buySol*px:null,
    trades:tr.length,buys:buys.length,largeBuys:large.length,observedHolders:bals.length,
    lastTradeAt:t.lastTradeAt,liveScore:t.lastScore?.score??null,reject,reasons,
    scoreReady:!reasons.length&&[buyShare,impact,concentration].every(x=>Number.isFinite(x)),
    evidence:{windowMin,largeThresholdUsd:largeUsd,solUsd:px,vsol:usable?t.vsol:null,concentrationScope:'Top 10 / sum of observed positive wallet balances. Not an on-chain holder census.'}};
}
export function scoringDashboard(engine, solUsd, largeUsd=250, now=Date.now()) {
  const threshold=Math.max(50,Math.min(100000,Number(largeUsd)||250));
  const tokens=[...engine.tokens.values()].filter(t=>!t.lite&&!t.finalized).sort((a,b)=>b.createdAt-a.createdAt).slice(0,200);
  return {asOf:now,largeThresholdUsd:threshold,windowMin:5,rows:tokens.map(t=>measureScoringToken(t,{now,solUsd,largeUsd:threshold})),
    note:'Research score only. Changes to weights never change live scores, rejects or paper entries. Large-trade participation can also indicate concentration or manipulation.'};
}
