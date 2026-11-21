'use strict';
// Read-only dependency preflight. Never installs, fetches or fakes node modules.
// A missing package is NOT_RUN, not a successful integration/build test.
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const PROJECT=path.resolve(__dirname,'..','..');
function checkProject(root, {resolver}={}){
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
 if(!Number.isSafeInteger(lock.lockfileVersion)||lock.lockfileVersion<2||!lock.packages?.[''])
  throw Error('lockfile v2/v3 with root package entry is required; NOT_RUN');
 const rootLock=lock.packages[''];
 const issues=[];
 if(rootLock.name!==pkg.name || rootLock.version!==pkg.version)
  issues.push('package identity differs from lockfile');
 const declared={...pkg.dependencies,...pkg.devDependencies};
 for(const [name,wanted] of Object.entries(declared)){
  const kind=Object.hasOwn(pkg.dependencies||{},name)?'dependencies':'devDependencies';
  if(rootLock[kind]?.[name]!==wanted)issues.push(`${name}: lockfile root specification mismatch`);
  if(!lock.packages[`node_modules/${name}`]?.version)issues.push(`${name}: lockfile package entry missing`);
 }
 for(const kind of ['dependencies','devDependencies'])for(const name of Object.keys(rootLock[kind]||{})){
  if(!Object.hasOwn(pkg[kind]||{},name))issues.push(`${name}: lockfile has undeclared ${kind}`);
 }
 const resolve=resolver||((name)=>createRequire(path.join(root,'package.json')).resolve(name));
 const absent=[];
 for(const name of Object.keys(declared))try{resolve(name);}catch{absent.push(name);}
 return {project:path.basename(root),declared:Object.keys(declared).length,
  available:Object.keys(declared).length-absent.length,missing:absent,lockfileIssues:issues,
  status:issues.length?'LOCKFILE_MISMATCH':absent.length?'NOT_RUN':'READY_FOR_TESTS'};
}
function report({backend,frontend}={}){
 const result=[checkProject(backend||path.join(PROJECT,'backend')),
  checkProject(frontend||path.join(PROJECT,'frontend'))];
 return {status:result.every(x=>x.status==='READY_FOR_TESTS')?'READY_FOR_TESTS':'NOT_RUN',projects:result};
}
if(require.main===module){
 try{
  const result=report();
  console.log(JSON.stringify(result,null,2));
  if(result.status!=='READY_FOR_TESTS'){
   console.error('v113: dependencies unavailable or lockfile mismatch; run npm ci in backend and frontend in a network-enabled environment; NOT_RUN');
   process.exitCode=1;
  }
 }catch(e){console.error(`v113: dependency preflight failed: ${e.message}`);process.exitCode=1;}
}
module.exports={checkProject,report};
