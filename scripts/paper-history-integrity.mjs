// Snapshot/verify immutable CLOSED curve-paper records around a source-only rollout.
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
const [mode,dbPath,manifestPath]=process.argv.slice(2);
if(!['snapshot','verify'].includes(mode)||!dbPath||!manifestPath) throw new Error('usage: node scripts/paper-history-integrity.mjs snapshot|verify DATABASE MANIFEST.json');
const db=new Database(dbPath,{readonly:true,fileMustExist:true});
const hash=r=>createHash('sha256').update(JSON.stringify(r)).digest('hex');
if(mode==='snapshot') {
  const rows=db.prepare("SELECT * FROM paper_trades WHERE status='closed' ORDER BY id").all().map(r=>({id:r.id,hash:hash(r)}));
  fs.writeFileSync(manifestPath,JSON.stringify({createdAt:new Date().toISOString(),rows}),{mode:0o600});
  console.log(JSON.stringify({mode,count:rows.length}));
} else {
  const prior=JSON.parse(fs.readFileSync(manifestPath,'utf8')),q=db.prepare('SELECT * FROM paper_trades WHERE id=?');
  const changed=prior.rows.filter(p=>hash(q.get(p.id))!==p.hash).map(p=>p.id);
  console.log(JSON.stringify({mode,checked:prior.rows.length,changed:changed.length,changedIds:changed.slice(0,20)}));
  if(changed.length) process.exitCode=1;
}
db.close();
