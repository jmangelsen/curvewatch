// Do not use checkpoint ages (60..600) as numeric object keys: V8 can allocate
// large sparse element stores for every mint. Dense arrays keep this bounded.
export function exitLabelStore(checkpoints) {
  const indexes=new Map(checkpoints.map((cp,i)=>[cp,i])), byMint=new Map();
  return {
    put(mint,checkpoint,value) {
      if(!indexes.has(checkpoint)) return;
      let a=byMint.get(mint);
      if(!a) {a=new Float64Array(checkpoints.length).fill(NaN);byMint.set(mint,a);}
      a[indexes.get(checkpoint)]=value==null?NaN:value;
    },
    get(mint,checkpoint) {
      const i=indexes.get(checkpoint);if(i==null)return undefined;
      const v=byMint.get(mint)?.[i];return Number.isNaN(v)?undefined:v;
    },
  };
}
