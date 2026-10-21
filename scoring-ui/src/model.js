export const DEFAULT_WEIGHTS={largeBuyShare:35,impactPerSol:30,concentration:35};
export const METRICS=[
  {key:'largeBuyShare',label:'Large-trade buy share',short:'Large buys',color:'#75e5c0',description:'Share of observed five-minute buy volume from trades meeting the USD threshold. Higher gets more research points; this is not validated as predictive.'},
  {key:'impactPerSol',label:'Price impact per SOL',short:'Depth',color:'#78aaff',description:'Modeled price change from a 1 SOL buy: 100 × ((1 + 1 / virtual SOL reserve)² − 1). Constant-product curve approximation, not an observed fill. Lower gets more points, reaching zero at 10%.'},
  {key:'concentration',label:'Wallet concentration',short:'Distribution',color:'#c6a5ff',description:'Top-ten share of the observed positive wallet balances, not total token supply. Trade-tape balances omit transfers and can be incomplete. Lower gets more research points.'}
];
export function scoreRow(row, weights) {
  const total=Object.values(weights).reduce((s,x)=>s+Math.max(0,Number(x)||0),0);
  if(!row.scoreReady || !total)return {...row,researchScore:null,components:[]};
  const clamp=x=>Math.max(0,Math.min(100,x));
  const raw={largeBuyShare:clamp(row.largeBuyShare),impactPerSol:clamp(100-row.impactPerSol*10),concentration:clamp(100-row.concentration)};
  const components=METRICS.map(m=>({...m,raw:raw[m.key],weight:Math.max(0,Number(weights[m.key])||0)/total,contribution:raw[m.key]*Math.max(0,Number(weights[m.key])||0)/total}));
  return {...row,researchScore:components.reduce((s,x)=>s+x.contribution,0),components};
}
export function sortRows(rows,key,dir='desc') {
  return [...rows].sort((a,b)=>{
    const x=a[key],y=b[key]; if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;
    const order=typeof x==='string'?x.localeCompare(y):x-y;
    return order*(dir==='desc'?-1:1);
  });
}
