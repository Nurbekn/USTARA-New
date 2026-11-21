'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {checkProject,report}=require('../scripts/v113-dependency-readiness');
const projectRoot=path.resolve(__dirname,'../..');
test('v113: both lockfiles are structurally compatible with declared direct packages',()=>{
 for(const name of ['backend','frontend']){
  const root=path.join(projectRoot,name);
  const expected=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const state=checkProject(root,{resolver:()=>'/hypothetical/installed/package'});
  assert.equal(state.status,'READY_FOR_TESTS');assert.deepEqual(state.lockfileIssues,[]);
  assert.equal(state.declared,Object.keys({...expected.dependencies,...expected.devDependencies}).length);
 }
});
test('v113: absent runtime packages never count as ready',()=>{
 for(const name of ['backend','frontend']){
  const r=checkProject(path.join(projectRoot,name),{resolver:()=>{throw Error('MODULE_NOT_FOUND');}});
  assert.equal(r.status,'NOT_RUN');assert.equal(r.available,0);
  assert.equal(r.missing.length,r.declared);
 }
});
test('v113: a partial dependency installation does not fake a successful build',()=>{
 const r=checkProject(path.join(projectRoot,'backend'),{resolver:name=>{
  if(name==='dotenv')return '/fake/dotenv';throw Error('absent');
 }});
 assert.equal(r.status,'NOT_RUN');assert.equal(r.available,1);
 assert.ok(r.missing.includes('pg'));assert.ok(r.missing.includes('express'));
});
test('v113: poisoned lockfile direct dependency version is rejected',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v113-'));
 try{
  fs.writeFileSync(path.join(tmp,'package.json'),JSON.stringify({name:'fake',version:'1.0',dependencies:{pg:'^8.0.0'}}));
  fs.writeFileSync(path.join(tmp,'package-lock.json'),JSON.stringify({name:'fake',version:'1.0',lockfileVersion:3,
   packages:{'':{name:'fake',version:'1.0',dependencies:{pg:'^7.0.0'}},'node_modules/pg':{version:'7.0.0'}}}));
  const r=checkProject(tmp,{resolver:()=>'/fake'});
  assert.equal(r.status,'LOCKFILE_MISMATCH');assert.match(r.lockfileIssues.join(' '),/pg/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('v113: no package lockfile is never treated as installation-ready',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v113-'));
 try{fs.writeFileSync(path.join(tmp,'package.json'),'{}');
  assert.throws(()=>checkProject(tmp),/ENOENT/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('v113: report includes backend and frontend without performing installation',()=>{
 const r=report();assert.equal(r.projects.length,2);
 assert.ok(['NOT_RUN','READY_FOR_TESTS'].includes(r.status));
 assert.ok(r.projects.every(x=>x.available<=x.declared));
});
