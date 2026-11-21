const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
let getModule;
async function get(){return getModule ||= import('../scripts/v153-decision-progress.mjs');}
const original=path.resolve(__dirname,'../../docs/USTARA_185_NAZORAT.csv');
async function modified(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v153-decisions-'));
 const p=path.join(dir,'registry.csv');fs.copyFileSync(original,p);
 try{return await fn(p);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('v153: original CSV exactly 185 and original SHA-256 unchanged',async()=>{
 const {summarizeDecisions,ORIGINAL_SHA256}=await get();
 const result=summarizeDecisions();assert.equal(result.total,185);
 assert.equal(result.sha256,ORIGINAL_SHA256);assert.equal(result.originalUnchanged,true);
});
test('v153: 130 require checks, 47 partial, 7 deferred, 1 blocked, no verified-complete assertion',async()=>{
 const {summarizeDecisions}=await get();const r=summarizeDecisions();
 assert.deepEqual(r.counts,{verificationNeeded:130,partialEvidence:47,deferredOrCancelled:7,blockedOrUnknown:1,verifiedComplete:0});
 assert.equal(r.releaseReadiness,'NOT_VERIFIED');
});
test('v153: multiple clauses and CSV quoting do not create extra decisions',async()=>{
 const {summarizeDecisions}=await get();const r=summarizeDecisions();
 assert.equal(Object.values(r.counts).reduce((a,b)=>a+b,0),185);
 assert.ok(r.examples.verificationNeeded.includes(1));
});
test('v153: progress CLI is read-only and returns JSON',()=>{
 const previous=fs.readFileSync(original);
 const result=spawnSync(process.execPath,['scripts/v153-decision-progress.mjs','--json'],{
  cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:8000});
 assert.equal(result.status,0,result.stderr);
 assert.equal(JSON.parse(result.stdout).total,185);
 assert.deepEqual(fs.readFileSync(original),previous);
});
test('v153: tampered registry never passes integrity check',async()=>modified(async file=>{
 const {summarizeDecisions}=await get();
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('Bosh sahifa kartalari','Yangi bosh sahifa kartalari'));
 assert.throws(()=>summarizeDecisions(file),/registry bytes differ/);
}));
test('v153: malformed CSV header fails even without enforced original checksum',async()=>modified(async file=>{
 const {summarizeDecisions}=await get();
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('raqam,qaror','id,qaror'));
 assert.throws(()=>summarizeDecisions(file,{requireOriginal:false}),/header mismatch/);
}));
test('v153: duplicate row number fails closed',async()=>modified(async file=>{
 const {summarizeDecisions}=await get();
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('\n2,Sartarosh bosh paneli','\n1,Sartarosh bosh paneli'));
 assert.throws(()=>summarizeDecisions(file,{requireOriginal:false}),/invalid decision row/);
}));
test('v153: missing decision fails closed',async()=>modified(async file=>{
 const {summarizeDecisions}=await get();
 const text=fs.readFileSync(file,'utf8');fs.writeFileSync(file,text.replace('1,Bosh sahifa kartalari adaptiv,6,Tekshiruv kerak,\n',''));
 assert.throws(()=>summarizeDecisions(file,{requireOriginal:false}),/185 decisions/);
}));
test('v153: unknown status never becomes verified complete',async()=>modified(async file=>{
 const {summarizeDecisions}=await get();
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('1,Bosh sahifa kartalari adaptiv,6,Tekshiruv kerak,','1,Bosh sahifa kartalari adaptiv,6,Tasdiqladim,'));
 const report=summarizeDecisions(file,{requireOriginal:false});
 assert.equal(report.counts.blockedOrUnknown,2);assert.equal(report.counts.verifiedComplete,0);
}));
test('v153: unterminated quoted evidence is rejected',async()=>modified(async file=>{
 const {summarizeDecisions}=await get();
 fs.appendFileSync(file,'"');assert.throws(()=>summarizeDecisions(file,{requireOriginal:false}),/unterminated|185 decisions/);
}));
