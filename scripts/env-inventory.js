// Reproducible inventory of named runtime/deployment configuration. Never loads an .env file.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const files=[];
function walk(dir) {for(const e of fs.readdirSync(dir,{withFileTypes:true})) {
  if(['node_modules','.git','data','backups'].includes(e.name))continue;
  const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(?:js|mjs|py|sh)$/.test(e.name))files.push(p);
}}
for(const d of ['src','scripts','deploy'])walk(path.join(root,d));
const names=new Set(['NODE_ENV','DATA_DIR','PORT']);
for(const f of files) {
  const s=fs.readFileSync(f,'utf8');
  for(const re of [/\b(?:process\.env|env)\.([A-Z][A-Z0-9_]+)/g,/\b(?:num|str|bool|list)\(['"]([A-Z][A-Z0-9_]+)['"]/g,/\bprocess\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g,/\bos\.environ\.get\(['"]([A-Z][A-Z0-9_]+)['"]/g,/\$\{([A-Z][A-Z0-9_]*):[-+?=]/g]) {
    for(const m of s.matchAll(re))names.add(m[1]);
  }
}
// The source example can contain supported older aliases; retain names but never retain their values.
const file=path.join(root,'.env.example');
for(const m of fs.readFileSync(file,'utf8').matchAll(/^([A-Z][A-Z0-9_]*)=/gm))names.add(m[1]);
const sorted=[...names].sort();
if(process.argv.includes('--check')) {
  const example=fs.readFileSync(file,'utf8');
  const present=new Set([...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(x=>x[1]));
  const missing=sorted.filter(x=>!present.has(x));
  const nonblank=[...example.matchAll(/^([A-Z][A-Z0-9_]*)=(.+)$/gm)].map(x=>x[1]);
  if(missing.length||nonblank.length) {console.error(JSON.stringify({missing,nonblank}));process.exit(1);}
  console.log(`Environment inventory: ${sorted.length} names; all values blank.`);
} else {
  fs.writeFileSync(file,[
    '# Curvewatch environment-variable inventory. All values deliberately blank.',
    '# Copy to .env; fill only the settings you intend to override. Blank runtime settings use code defaults.',
    '# Runtime configuration is in src/config.js. Deployment aliases (APP, IP, KEY, ZIP, etc.) are optional shell inputs.',
    '# Never commit .env, credentials, key-bearing RPC URLs, private keys, or populated secrets.',
    '# HELIUS_API_KEY enables prospective exact holder collection. No wallet private key is used.',
    '# Set DASHBOARD_PASSWORD before exposing the collector API outside localhost.',
    '',...sorted.map(x=>`${x}=`),''
  ].join('\n'));
  console.log(`Wrote ${sorted.length} variable names with blank values.`);
}
