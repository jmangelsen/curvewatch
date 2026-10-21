// Standalone research panel. No browser storage and no mutating API routes.
const panel=document.querySelector('#latePanel'), api=(window.CURVEWATCH_API||'').replace(/\/$/,'');
const $=s=>panel.querySelector(s), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd=x=>x==null?'Not available':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(x);
const num=x=>x==null?'Not available':new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(x);
const stamp=x=>x?new Date(x).toLocaleString():'Not recorded';
let data=null,busy=false,last=0;
const dialog=document.createElement('dialog'); dialog.className='late-dialog';
dialog.innerHTML='<form method="dialog"><button class="btn" aria-label="Close experiment details">Close</button></form><div class="late-dialog-body"></div>';
document.body.append(dialog);
const show=(title,body)=>{
  dialog.querySelector('.late-dialog-body').innerHTML=`<h2>${esc(title)}</h2>${body}`;
  if(!dialog.open)dialog.showModal();
};
const facts=o=>`<dl class="late-facts">${Object.entries(o).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
const empty=text=>`<div class="late-empty">${esc(text)}</div>`;
async function load() {
  if(busy)return; busy=true;
  try {
    const r=await fetch(`${api}/api/studio/late`); if(!r.ok)throw new Error(`Experiment endpoint returned ${r.status}`);
    data=await r.json(); last=Date.now(); render();
  } catch(e){ $('#lateStatus').textContent=`Unavailable: ${e.message}. Existing books are unchanged.`; }
  finally{busy=false;}
}
function render() {
  const d=data,r=d.rule;
  $('#lateStatus').textContent=`${d.status}. Registered ${stamp(d.registeredAt)} · version ${d.version}${d.error?' · monitor error: '+d.error:''}`;
  const tiles=[
    ['registration','Registered rule',d.version,'Fixed before new outcomes'],
    ['cohorts','Cohorts enrolled',d.cohortCount,'No retroactive or reconstructed entries'],
    ['capital','Capital ceiling',usd(r.maxOpenCohorts*r.sizeUsd),'Per independent $1,000 arm'],
    ['data','Data readiness',d.status.startsWith('blocked')?'Waiting for holders':'Forward collection','Missing evidence blocks entry']
  ];
  $('#lateTiles').innerHTML=tiles.map(([key,l,v,s])=>`<button type="button" class="late-tile" data-late-tile="${key}"><span>${esc(l)}</span><strong>${esc(v)}</strong><small>${esc(s)}</small></button>`).join('');
  $('#lateHorizons').innerHTML=d.horizon.map(h=>`<button type="button" class="late-horizon" data-late-arm="${h.arm}">
    <span>${h.arm==='managed36h'?'36h + partial':h.arm.replace('h',' hours')}</span>
    <strong>${h.closed?usd(h.meanUsd):'Awaiting outcomes'}</strong>
    <small>Mean net P&amp;L / $50 entry</small>
    <span class="late-arm-counts">${h.open} open · ${h.closed} closed · ${h.censored} censored</span>
    <span class="late-pair">${h.pairs?`${usd(h.pairedMeanUsd)} vs 6h · ${h.pairs} pairs`:'No completed pairs yet'}</span>
  </button>`).join('');
  $('#lateRules').innerHTML=`${facts({
    'Eligibility':'Pool age 2–24h; market cap $30k–$2m; liquidity ≥$25k; no existing safety reject.',
    'Holder evidence':'At least 200 observed unique owners, ≥5% growth over 2h, at least 3 exact readings; no interval loss >2%. No reconstructed or capped counts.',
    'Persistence':'Two separated hourly windows each ≥$10k volume, ≥30 buys, buy share ≥50%; liquidity retains ≥80% of its 2h value.',
    'Price stabilization':'1h price ratio 0.9–1.5; 2h prospective price coverage with gaps ≤15m.',
    'Entry':'Qualify, then recheck at the next fresh quote at least 30 seconds later; signal expires in 2 minutes. One cohort per mint per version.',
    'Exit safety':'35% observed-price stop; liquidity below $10k or 50% of entry; new safety reject. These override all time horizons.',
    'Managed arm':'Sell 50% at the first observed ≥2× quote; remaining portion uses a 30% peak-price trail; mandatory exit by 36h.',
    'Costs':'$50 per independent arm; 1% fee + 2% slippage each side, plus pool-impact proxy. No fills at unobserved target/stop prices.',
    'Missing path':'Restart, quote gap >15m or pool switch censors the affected arms. Missing-as-total-loss sensitivity is displayed in details.',
    'Capital':'Five counterfactual arms with $1,000 each, maximum ten concurrent cohorts per arm; not one combined real portfolio.',
    'Evaluation':'Same-entry paired differences against 6h, mean/median net dollars, drawdown and dollar-hour efficiency. No automatic rule promotion.'
  })}`;
  $('#lateCandidates').innerHTML=d.candidates.length?d.candidates.map((c,i)=>`<button type="button" class="late-row" data-late-candidate="${i}"><span><b>${esc(c.symbol)}</b><small>${esc(c.state)}</small></span><span>${usd(c.mcap)}<small>${esc(c.reasons[0]||'All requirements met; waiting for next quote')}</small></span></button>`).join(''):empty('No coins are currently inside the initial research window. Nothing is entered on missing evidence.');
  $('#lateCohorts').innerHTML=d.cohorts.length?d.cohorts.map(c=>`<button type="button" class="late-row" data-late-cohort="${c.id}"><span><b>${esc(c.symbol)}</b><small>${esc(stamp(c.entry_at))}</small></span><span>${c.arms.filter(a=>a.state==='closed').length}/5 closed<small>See entry evidence and observed exits</small></span></button>`).join(''):empty('No qualifying prospective entries yet. Historical winners are not seeded into this experiment.');
  $('#lateVerdict').textContent=d.verdict;
}
panel.addEventListener('click',async e=>{
  const b=e.target.closest('button'); if(!b || !data)return;
  const key=b.dataset.lateTile;
  if(key) {
    if(key==='capital')show('Independent paper allocations',facts({'Size per arm':usd(data.rule.sizeUsd),'Bankroll per arm':usd(data.rule.bankrollPerArmUsd),'Concurrent cohorts':data.rule.maxOpenCohorts,'Current enrolled cohorts':data.cohortCount,'Execution':'Paper-only; no wallet signing or order submission'}));
    else if(key==='data')show('Why data readiness matters',`<p>${esc(data.status)}</p><ul>${data.caveats.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p>HELIUS_API_KEY must be installed securely on the collector. Do not paste it into chat. New exact readings must then build a two-hour history.</p>`);
    else if(key==='cohorts') { show('Enrollment and coverage',facts({'Registered':stamp(data.registeredAt),'Enrolled':data.cohortCount,'Candidate observations':data.candidateCount,'Last evaluation':stamp(data.lastTick),'Rule version':data.version})); }
    else show('Prospective registration',facts({'Version':data.version,'Registered':stamp(data.registeredAt),'Promotion':'None. Unvalidated candidate thresholds, not optimized or guaranteed returns.'}));
  }
  if(b.dataset.lateArm) {
    const h=data.horizon.find(x=>x.arm===b.dataset.lateArm);
    show(`Exit comparison: ${h.arm}`,facts({'Closed':h.closed,'Open':h.open,'Censored':h.censored,'Mean net':usd(h.meanUsd),'Median net':usd(h.medianUsd),'Paired observations vs 6h':h.pairs,'Paired mean difference':usd(h.pairedMeanUsd),'Maximum observed peak drawdown':h.worstDrawdownPct==null?'Not available':num(h.worstDrawdownPct)+'%','Return per dollar-hour':num(h.returnPerDollarHour),'Mean if censored arms lose all $50':usd(h.missingAsTotalLossUsd)}));
  }
  if(b.dataset.lateCandidate!=null) {
    const c=data.candidates[+b.dataset.lateCandidate];
    show(`${c.symbol}: ${c.state}`,`${facts({'Mint':c.mint,'Market cap':usd(c.mcap),'Pool liquidity':usd(c.liq)})}<h3>Entry checks</h3><ul>${(c.reasons.length?c.reasons:['All eligibility checks currently pass.']).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>${facts(c.metrics)}`);
  }
  if(b.dataset.lateCohort) {
    show('Loading cohort','<p>Reading recorded evidence…</p>');
    try {
      const res=await fetch(`${api}/api/studio/late/${b.dataset.lateCohort}`);if(!res.ok)throw new Error('Cohort unavailable');
      const c=await res.json();
      show(`${c.symbol}: cohort #${c.id}`,`${facts({'Signal':stamp(c.signal_at),'Entry':stamp(c.entry_at),'USD price':c.entry_price,'Version':c.version,...c.evidence.metrics})}
        <h3>Arms</h3>${c.arms.map(a=>`<p><b>${esc(a.arm)}</b>: ${esc(a.state)} · ${a.pnl==null?'No realized result':usd(a.pnl)} · ${esc(a.exit_reason||'awaiting exit')}</p>`).join('')}
        <h3>Recorded events</h3><ol>${c.events.map(x=>`<li>${esc(stamp(x.ts))} · ${esc(x.arm)} · ${esc(x.kind)}${x.proceeds==null?'':` · ${usd(x.proceeds)}`} ${esc(x.note||'')}</li>`).join('')}</ol>`);
    } catch(e){show('Cohort unavailable',`<p>${esc(e.message)}</p>`);}
  }
});
$('#lateRefresh').addEventListener('click',load);
const studio=document.querySelector('#tab-studio');
new MutationObserver(()=>{if(!studio.hidden && Date.now()-last>30000)load();}).observe(studio,{attributes:true,attributeFilter:['hidden']});
setInterval(()=>{if(!studio.hidden && !document.hidden)load();},60000);
if(!studio.hidden)load();
