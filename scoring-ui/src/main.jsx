import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import css from './style.css?inline';
import {METRICS,DEFAULT_WEIGHTS,scoreRow,sortRows} from './model.js';
const api=(window.CURVEWATCH_API||'').replace(/\/$/,'');
const fmt=(x,d=1)=>x==null?'Unavailable':Number(x).toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
const dollars=x=>x==null?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:1}).format(x);
const median=a=>{const s=a.filter(Number.isFinite).sort((a,b)=>a-b);return s.length?s[Math.floor(s.length/2)]:null;};
const box='cw-bg-panel cw-border cw-border-solid cw-border-line cw-rounded-xl';
const button='cw-bg-transparent cw-text-ink cw-border cw-border-solid cw-border-line cw-rounded-lg cw-px-3 cw-py-2 cw-text-sm';
function App(){
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [weights,setWeights]=useState({...DEFAULT_WEIGHTS}),[threshold,setThreshold]=useState(250);
  const [query,setQuery]=useState(''),[scope,setScope]=useState('all'),[sort,setSort]=useState({key:'researchScore',dir:'desc'}),[selected,setSelected]=useState(null),[info,setInfo]=useState(null);
  const dialog=useRef(null),request=useRef(0),controller=useRef(null);
  async function refresh(){
    const seq=++request.current;controller.current?.abort();const ctrl=new AbortController();controller.current=ctrl;setBusy(true);
    try{const r=await fetch(`${api}/api/scoring?largeUsd=${threshold}`,{signal:ctrl.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();if(seq===request.current){setData(d);setError('');}}
    catch(e){if(e.name!=='AbortError'&&seq===request.current)setError(e.message);}
    finally{if(seq===request.current)setBusy(false);}
  }
  useEffect(()=>{refresh();const id=setInterval(()=>{if(!document.hidden&&!document.querySelector('#tab-scoring').hidden)refresh();},15000);return()=>{clearInterval(id);controller.current?.abort();};},[threshold]);
  const evaluated=useMemo(()=>(data?.rows||[]).map(r=>scoreRow(r,weights)),[data,weights]);
  const rows=useMemo(()=>sortRows(evaluated.filter(r=>(scope==='all'||(scope==='ready'?r.scoreReady:!!r.reject))&&`${r.symbol} ${r.name} ${r.mint}`.toLowerCase().includes(query.toLowerCase())),sort.key,sort.dir),[evaluated,query,scope,sort]);
  const chosen=evaluated.find(r=>r.mint===selected);
  const total=Object.values(weights).reduce((a,b)=>a+b,0);
  const open=(mint=null,topic=null)=>{setSelected(mint);setInfo(topic);if(!dialog.current.open)dialog.current.showModal();};
  const sortBy=key=>setSort(s=>({key,dir:s.key===key&&s.dir==='desc'?'asc':'desc'}));
  const heads=[['symbol','Coin'],['researchScore','Research score'],['largeBuyShare','Large-buy share'],['impactPerSol','Impact / 1 SOL'],['concentration','Top-10 share'],['buyVolumeUsd','Buy volume'],['marketCapUsd','Market cap'],['liveScore','Live score']];
  return <div className="cw-bg-[#0b1119] cw-text-ink cw-rounded-2xl cw-p-4 md:cw-p-7 cw-font-sans">
    <header className="cw-flex cw-flex-wrap cw-items-start cw-justify-between cw-gap-5">
      <div><div className="cw-text-xs cw-tracking-widest cw-text-mint cw-mb-2">CURVEWATCH / SIGNAL WORKBENCH</div><h1 className="cw-m-0 cw-text-3xl cw-font-semibold cw-tracking-tight">See what the score is made of.</h1><p className="cw-text-muted cw-text-sm cw-max-w-2xl cw-leading-relaxed">Live coin measurements, transparent contributions, and a weighting sandbox. Research scores never override safety rejects or change live paper entries.</p></div>
      <div className="cw-flex cw-gap-2 cw-items-center"><span className="cw-badge cw-text-mint">READ ONLY</span><button className={button} onClick={refresh} disabled={busy}>{busy?'Updating…':'Refresh'}</button></div>
    </header>
    {error&&<div role="alert" className="cw-text-[#ffb5a9] cw-py-3">Feed unavailable: {error}. {data?'Last successful snapshot remains visible.':'No sample coins have been invented.'}</div>}
    <div className="cw-text-xs cw-text-muted cw-mb-4">{data?`Snapshot ${new Date(data.asOf).toLocaleTimeString()} · five-minute window · up to 200 active curve tokens`:'Waiting for live measurements…'}</div>
    <div className="cw-grid cw-grid-cols-2 lg:cw-grid-cols-4 cw-gap-3 cw-mb-6">
      {[['Observed coins',evaluated.length,'coverage'],['Score-ready',evaluated.filter(r=>r.scoreReady).length,'coverage'],['Median large-buy share',fmt(median(evaluated.map(r=>r.largeBuyShare)))+'%','largeBuyShare'],['Median top-10 share',fmt(median(evaluated.map(r=>r.concentration)))+'%','concentration']].map(([label,value,key],i)=><button key={i} className={`${box} cw-text-left cw-p-4 cw-text-ink`} onClick={()=>open(null,key)}><span className="cw-text-xs cw-text-muted">{label}</span><strong className="cw-block cw-text-2xl cw-mt-3">{value}</strong><small className="cw-block cw-mt-2 cw-text-muted">Inspect definition and coverage</small></button>)}
    </div>
    <div className="cw-grid lg:cw-grid-cols-[280px_minmax(0,1fr)] cw-gap-5">
      <aside className={`${box} cw-p-5 cw-self-start`}>
        <div className="cw-flex cw-items-center cw-justify-between"><h2 className="cw-text-base cw-m-0">Weighting lab</h2><button onClick={()=>setWeights({...DEFAULT_WEIGHTS})} className="cw-border-0 cw-bg-transparent cw-text-mint cw-text-xs cw-py-2">Reset</button></div>
        <p className="cw-text-xs cw-text-muted cw-leading-relaxed">Weights normalize to 100%. All-zero weights disable scoring. No weights are saved to the engine.</p>
        {METRICS.map(m=><label key={m.key} className="cw-block cw-mt-6"><span className="cw-flex cw-justify-between cw-text-sm"><span>{m.short}</span><b style={{color:m.color}}>{total?Math.round(weights[m.key]/total*100):0}%</b></span><input type="range" min="0" max="100" value={weights[m.key]} aria-label={`${m.label} weight`} onChange={e=>setWeights(w=>({...w,[m.key]:Number(e.target.value)}))}/><button type="button" onClick={()=>open(null,m.key)} className="cw-bg-transparent cw-border-0 cw-text-muted cw-text-xs cw-p-0 cw-text-left">{m.label}: {m.key==='largeBuyShare'?'higher':'lower'} = more points</button></label>)}
        <label className="cw-block cw-mt-7 cw-text-sm">Large-buy threshold<select aria-label="Large buy threshold in USD" value={threshold} onChange={e=>setThreshold(Number(e.target.value))} className="cw-block cw-w-full cw-mt-2 cw-bg-[#0b1119] cw-text-ink cw-rounded-lg cw-border cw-border-solid cw-border-line cw-p-2">{[100,250,500,1000,2500].map(v=><option value={v} key={v}>${v.toLocaleString()}</option>)}</select></label>
        <div className="cw-mt-6 cw-border-t cw-border-solid cw-border-line cw-pt-4 cw-text-xs cw-text-muted cw-leading-relaxed">Higher large-buy share is not inherently safer. Impact is modeled. Wallet balances come from the observed trade tape, not a holder census.</div>
      </aside>
      <section className={`${box} cw-min-w-0 cw-overflow-hidden`}>
        <div className="cw-flex cw-flex-wrap cw-gap-3 cw-p-4 cw-items-center cw-justify-between"><input aria-label="Search coins" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, ticker or mint" className="cw-bg-[#0b1119] cw-border cw-border-solid cw-border-line cw-rounded-lg cw-text-ink cw-px-3 cw-py-2 cw-text-sm cw-min-w-0 cw-flex-1"/><select aria-label="Coin eligibility filter" className={`${button} cw-bg-panel`} value={scope} onChange={e=>setScope(e.target.value)}><option value="all">All observed</option><option value="ready">Score-ready</option><option value="rejected">Rejected</option></select></div>
        <div className="cw-overflow-x-auto"><table><thead className="cw-text-muted"><tr>{heads.map(([key,label])=><th key={key} aria-sort={sort.key===key?(sort.dir==='asc'?'ascending':'descending'):'none'}><button onClick={()=>sortBy(key)}>{label}{sort.key===key?(sort.dir==='asc'?' ↑':' ↓'):''}</button></th>)}</tr></thead>
          <tbody>{rows.map(r=><tr key={r.mint} className="hover:cw-bg-[#172434]"><td><button className="cw-bg-transparent cw-border-0 cw-text-ink cw-text-left cw-p-0" onClick={()=>open(r.mint)}><b>{r.symbol}</b><span className="cw-block cw-text-muted cw-text-xs cw-mt-1">{r.reject?'Safety reject':r.scoreReady?'Score-ready':'Limited coverage'} · {r.trades} trades</span></button></td><td><button className="cw-border-0 cw-bg-transparent cw-text-ink cw-p-0 cw-w-full" onClick={()=>open(r.mint)}>{r.researchScore==null?'Not scored':fmt(r.researchScore)}<div className="metric-track cw-mt-2">{r.components.map(c=><span key={c.key} style={{width:c.contribution+'%',background:c.color}}/>)}</div></button></td><td>{r.largeBuyShare==null?'Unavailable':fmt(r.largeBuyShare)+'%'}</td><td>{r.impactPerSol==null?'Unavailable':fmt(r.impactPerSol,2)+'%'}</td><td>{r.concentration==null?'Unavailable':fmt(r.concentration)+'%'}</td><td>{dollars(r.buyVolumeUsd)}</td><td>{dollars(r.marketCapUsd)}</td><td>{r.liveScore==null?'Unavailable':fmt(r.liveScore,0)}</td></tr>)}</tbody></table></div>
        {!rows.length&&<div className="cw-p-10 cw-text-center cw-text-muted">{busy?'Loading current coins…':query||scope!=='all'?'No coins match these filters.':'No active curve coins are available. The collector must supply observations.'}</div>}
        <div className="cw-p-4 cw-text-xs cw-text-muted">{rows.length} shown · Missing metrics are not treated as zero · Scores require ≥20 recent trades and a trade within 60 seconds.</div>
      </section>
    </div>
    <dialog ref={dialog} onClose={()=>{setSelected(null);setInfo(null)}}><form method="dialog" className="cw-text-right"><button className={button}>Close</button></form>
      {chosen?<><h2 className="cw-text-2xl">{chosen.symbol} / score breakdown</h2><p className="cw-text-xs cw-text-muted cw-break-all">{chosen.mint}</p><p>Research: {chosen.researchScore==null?'Not scored':fmt(chosen.researchScore)} · Live engine: {fmt(chosen.liveScore)} · {chosen.reject?'Rejected: '+chosen.reject:'No current rejection shown'}</p>
        {chosen.components.map(c=><div key={c.key} className="cw-my-5"><div className="cw-flex cw-justify-between cw-text-sm"><span>{c.label}</span><b>{fmt(c.contribution)} points</b></div><div className="score-bar cw-my-2"><span style={{width:c.raw+'%',background:c.color}}/></div><div className="cw-text-xs cw-text-muted">{fmt(c.raw)} normalized × {fmt(c.weight*100)}% weight</div></div>)}
        <h3 className="cw-text-base">Coverage</h3><ul className="cw-text-sm cw-text-muted cw-leading-relaxed">{(chosen.reasons.length?chosen.reasons:['Current observations meet the display-score coverage requirements.']).map(x=><li key={x}>{x}</li>)}<li>{chosen.observedHolders} positive observed wallets; {chosen.buys} buys, {chosen.largeBuys} large buys.</li><li>{chosen.evidence.concentrationScope}</li><li>Quote conversion: ${fmt(chosen.evidence.solUsd,2)} per SOL. Impact is a percentage per modeled 1 SOL trade, not a dollar balance.</li></ul>
        <a className="cw-text-mint cw-text-sm" href={`https://pump.fun/coin/${encodeURIComponent(chosen.mint)}`} target="_blank" rel="noopener noreferrer">Open coin on pump.fun</a></>:selected?<p>The coin left the live observation window. Close and select a current row.</p>:<><h2>{METRICS.find(x=>x.key===info)?.label||'Observation coverage'}</h2><p className="cw-text-muted cw-text-sm cw-leading-relaxed">{METRICS.find(x=>x.key===info)?.description||'Only active curve coins with intact trade detail are measured. Unsupported quotes, stale tapes, missing USD conversion, fewer than 20 trades, or exhausted tape storage prevent scoring. Rejects remain rejects even if their exploratory score is high.'}</p></>}
    </dialog>
  </div>;
}
const host=document.querySelector('#scoringRoot');
if(host){const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style');style.textContent=css;shadow.append(style);const mount=document.createElement('div');shadow.append(mount);createRoot(mount).render(<App/>);}
