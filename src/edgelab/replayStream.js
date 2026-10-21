// Keep only one reserve tape in memory, not 2,500 duplicated tapes across paper books.
export function streamReplay(records, rules, loadTape, simulate) {
  const values = rules.map(() => []);
  let withTape = 0;
  for (const r of records) {
    const t = loadTape(r);
    if (t.length < 5) continue;
    withTape++;
    for (let i=0;i<rules.length;i++) {
      const x=simulate({r,t},rules[i].P);
      if(x!=null) values[i].push({ts:r.entry_ts,net:x*100});
    }
  }
  return {values,withTape};
}
