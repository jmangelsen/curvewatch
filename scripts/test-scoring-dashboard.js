import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'scoring-test-'));
const {measureScoringToken}=await import('../src/scoringDashboard.js');
const {scoreRow,sortRows,DEFAULT_WEIGHTS}=await import('../scoring-ui/src/model.js');
const now=Date.now(), token={mint:'test',symbol:'TEST',name:'Test',createdAt:now-60000,lastTradeAt:now,quoteOk:true,mcap:100,vsol:30,vtok:1000000,holders:new Map(Array.from({length:20},(_,i)=>['w'+i,100])),trades:Array.from({length:20},(_,i)=>({at:now-i*1000,b:true,sol:i===0?10:1}))};
let n=0;const t=(name,fn)=>{fn();n++;console.log('ok',name);};
t('large trade share uses USD threshold and buy volume, not trade count',()=>{
  const r=measureScoringToken(token,{now,solUsd:100,largeUsd:250});
  assert.equal(r.largeBuys,1);assert.ok(Math.abs(r.largeBuyShare-1000/2900*100)<1e-8);assert.equal(r.buyVolumeUsd,2900);
});
t('impact is explicit constant product model and concentration uses observed wallet denominator',()=>{
  const r=measureScoringToken(token,{now,solUsd:100});assert.ok(Math.abs(r.impactPerSol-100*((31/30)**2-1))<1e-10);assert.equal(r.concentration,50);
});
t('unsupported quote, stale tape, sparse trade detail and no USD conversion are not scored',()=>{
  for(const change of [{quoteOk:false},{lastTradeAt:now-61000},{trades:token.trades.slice(0,2)}])assert.equal(measureScoringToken({...token,...change},{now,solUsd:100}).scoreReady,false);
  assert.equal(measureScoringToken(token,{now,solUsd:null}).largeBuyShare,null);
});
t('weights normalize and zero weights disable scores without changing source rows',()=>{
  const row=measureScoringToken(token,{now,solUsd:100});
  const copy=JSON.stringify(row);assert.ok(scoreRow(row,DEFAULT_WEIGHTS).researchScore>=0);
  assert.equal(scoreRow(row,{largeBuyShare:0,impactPerSol:0,concentration:0}).researchScore,null);
  assert.equal(scoreRow(row,{largeBuyShare:100,impactPerSol:0,concentration:0}).researchScore,row.largeBuyShare);assert.equal(JSON.stringify(row),copy);
});
t('sort toggles direction while missing values stay last',()=>{
  const rows=[{x:3},{x:null},{x:1}];assert.deepEqual(sortRows(rows,'x','asc').map(x=>x.x),[1,3,null]);assert.deepEqual(sortRows(rows,'x','desc').map(x=>x.x),[3,1,null]);
});
console.log(`${n} scoring dashboard tests passed`);
