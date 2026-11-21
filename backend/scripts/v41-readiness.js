'use strict';
// Offline diagnostics only. No secrets, DB access, npm install, or network.
const fs=require('node:fs');const path=require('node:path');
const {createRequire}=require('node:module');
const {auditProject}=require('./audit-phase1');
const BACKEND=['bcrypt','cors','dotenv','express','jsonwebtoken','pg'];
const FRONTEND=['react','react-dom','react-router-dom','vite','eslint'];
function inspectDependencies(projectRoot){
 // package.json alone can be a placeholder or an incomplete npm install.
 const inspect=(folder,names)=>{
  const from=createRequire(path.join(projectRoot,folder,'package.json'));
  return Object.fromEntries(names.map(name=>{
   try {
    const manifest=JSON.parse(fs.readFileSync(path.join(projectRoot,folder,'node_modules',name,'package.json'),'utf8'));
    const entry=fs.realpathSync(from.resolve(name));
    const packageDir=fs.realpathSync(path.join(projectRoot,folder,'node_modules',name));
    const relative=path.relative(packageDir,entry);
    const insidePackage=relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative);
    return [name,manifest.name===name && typeof manifest.version==='string' && manifest.version.length>0 && insidePackage];
   } catch {return [name,false];}
  }));
 };
 return {backend:inspect('backend',BACKEND),frontend:inspect('frontend',FRONTEND)};
}
function report(projectRoot=path.resolve(__dirname,'../..')){
 let audit,offlineAuditPassed=false;
 try{audit=auditProject(projectRoot);offlineAuditPassed=audit.decisionCount===185&&audit.migrationCount===63;}
 catch{audit={error:'offline structural audit failed'};}
 const dependencies=inspectDependencies(projectRoot);
 const missing=Object.entries(dependencies).flatMap(([side,mods])=>
  Object.entries(mods).filter(([,exists])=>!exists).map(([name])=>`${side}:${name}`));
 return {version:'v45',offlineAuditPassed,audit,dependencies,missing,
  lockfiles:{backend:fs.existsSync(path.join(projectRoot,'backend','package-lock.json')),
   frontend:fs.existsSync(path.join(projectRoot,'frontend','package-lock.json'))},
  backendFullSuite:missing.some(x=>x.startsWith('backend:'))?'BLOCKED_DEPENDENCIES':'NOT_RUN',
  viteBuild:missing.some(x=>x.startsWith('frontend:'))?'BLOCKED_DEPENDENCIES':'NOT_RUN',
  eslint:missing.includes('frontend:eslint')?'BLOCKED_DEPENDENCIES':'NOT_RUN',
  postgresqlIntegration:'NOT_RUN',telegramLiveE2E:'NOT_RUN',mobileBrowserE2E:'NOT_RUN',
  productionReady:false};
}
if(require.main===module){
 const state=report();
 console.log(JSON.stringify(state,null,2));
 if(!state.offlineAuditPassed||state.missing.length)process.exitCode=1;
}
module.exports={inspectDependencies,report};
