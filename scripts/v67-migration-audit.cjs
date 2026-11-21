'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
function auditMigrations(root=path.resolve(__dirname,'../backend/database')){
 const migrations=path.join(root,'migrations');
 const entries=fs.readdirSync(migrations,{withFileTypes:true});
 const forward=entries.filter(x=>x.name.endsWith('.sql')&&!x.name.endsWith('_rollback.sql'));
 const rollback=entries.filter(x=>x.name.endsWith('_rollback.sql'));
 if(forward.length!==63||rollback.length!==2)throw Error('v67: expected exactly 63 forward and 2 rollback migrations');
 if(entries.some(x=>!x.isFile()||x.isSymbolicLink()))throw Error('v67: unsafe migration directory entry');
 const bootstrap=fs.readFileSync(path.join(root,'bootstrap.sql'),'utf8');
 const refs=[...bootstrap.matchAll(/^\\ir\s+migrations\/([^\s]+\.sql)\s*$/gm)].map(m=>m[1]);
 if(refs.length!==63||new Set(refs).size!==63)throw Error('v67: bootstrap must reference each forward migration exactly once');
 if(refs.some((x,i)=>x!==forward.map(f=>f.name).sort()[i])){
   // Bootstrap's historical order need not be alphabetical; check membership instead.
   const all=new Set(forward.map(f=>f.name));
   if(refs.some(x=>!all.has(x)))throw Error('v67: unknown bootstrap migration');
 }
 const names=new Set(forward.map(f=>f.name));
 for(const name of refs)if(!names.has(name))throw Error('v67: missing migration '+name);
 for(const f of forward) {
   const p=path.join(migrations,f.name),s=fs.lstatSync(p);
   if(!s.isFile()||s.isSymbolicLink()||s.size===0||s.size>2*1024*1024)throw Error('v67: unsafe SQL file');
 }
 const sha=crypto.createHash('sha256');
 for(const name of refs){sha.update(name+'\0');sha.update(fs.readFileSync(path.join(migrations,name)));}
 return {forward:63,rollback:2,referenced:refs.length,bootstrap_order_sha256:sha.digest('hex'),status:'OFFLINE_PASS',runtime:'NOT_RUN'};
}
if(require.main===module){try{console.log(JSON.stringify(auditMigrations(),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={auditMigrations};
