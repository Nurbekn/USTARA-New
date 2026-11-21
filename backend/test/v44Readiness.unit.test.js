'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {inspectDependencies,report}=require('../scripts/v41-readiness');

test('v44 readiness checks resolution, not mere node_modules placeholder',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v44-readiness-'));
 try{
  fs.mkdirSync(path.join(root,'backend','node_modules','cors'),{recursive:true});
  fs.mkdirSync(path.join(root,'frontend'),{recursive:true});
  fs.writeFileSync(path.join(root,'backend','package.json'),'{}');
  fs.writeFileSync(path.join(root,'frontend','package.json'),'{}');
  const dir=path.join(root,'backend','node_modules','cors');
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:'cors',version:'2.0.0',main:'index.js'}));
  assert.equal(inspectDependencies(root).backend.cors,false); // missing entry point
  fs.writeFileSync(path.join(dir,'index.js'),'module.exports = {}');
  assert.equal(inspectDependencies(root).backend.cors,true);
  fs.writeFileSync(path.join(dir,'package.json'),'{ broken');
  assert.equal(inspectDependencies(root).backend.cors,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('v44 readiness remains offline and does not label missing dependencies as passing',()=>{
 const data=report(path.resolve(__dirname,'../..'));
 assert.equal(data.version,'v45');
 assert.equal(data.productionReady,false);
 assert.equal(data.lockfiles.backend,true);
 assert.equal(data.lockfiles.frontend,true);
 assert.ok(Array.isArray(data.missing));
});
