'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {inspectDependencies,report}=require('../scripts/v41-readiness');
test('v41 readiness audit never declares live integrations successful',()=>{
 const state=report();assert.equal(state.audit.decisionCount,185);
 assert.equal(state.audit.migrationCount,63);
 assert.equal(state.postgresqlIntegration,'NOT_RUN');
 assert.equal(state.telegramLiveE2E,'NOT_RUN');
 assert.equal(state.mobileBrowserE2E,'NOT_RUN');
 assert.equal(state.productionReady,false);
});
test('v41 dependency check does not trust empty npm package directories',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v41-'));
 try{
  for(const sub of ['backend/node_modules/pg','frontend/node_modules/vite'])
    fs.mkdirSync(path.join(dir,sub),{recursive:true});
  let state=inspectDependencies(dir);
  assert.equal(state.backend.pg,false);assert.equal(state.frontend.vite,false);
  fs.writeFileSync(path.join(dir,'backend/node_modules/pg/package.json'),'{}');
  state=inspectDependencies(dir);assert.equal(state.backend.pg,false);
  // Only a valid manifest AND a resolvable entry point count as installed.
  fs.writeFileSync(path.join(dir,'backend/node_modules/pg/package.json'),
    JSON.stringify({name:'pg',version:'8.0.0',main:'index.js'}));
  fs.writeFileSync(path.join(dir,'backend/node_modules/pg/index.js'),'module.exports = {};');
  state=inspectDependencies(dir);assert.equal(state.backend.pg,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
