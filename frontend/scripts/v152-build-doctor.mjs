// USTARA v152 — offline, dependency-free build readiness diagnostics.
// A readiness PASS means only that a real npm/Vite build may be attempted.
// It NEVER certifies a compiled bundle or a browser test.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkPagesSource,checkFrontendLock} from './v150-pages-source-check.mjs';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = why => {throw new Error(`v152: ${why}; NOT PASS`);};
const fileJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const versionParts = value => {
  if(!/^v?\d+(?:\.\d+){0,2}$/.test(String(value))) return null;
  const result=String(value).replace(/^v/,'').split('.').map(Number);
  while(result.length<3) result.push(0);
  return result;
};
const compare = (a,b) => a[0]-b[0]||a[1]-b[1]||a[2]-b[2];
// The three critical tool packages currently lock to simple npm OR ranges.
// Unknown syntax fails closed instead of falsely reporting Node support.
export function supportsNode(range, nodeVersion=process.version){
  const current=versionParts(nodeVersion);
  if(!current||typeof range!=='string'||!range.trim()) return false;
  return range.split('||').some(disjunction => {
    const clauses=disjunction.trim().split(/\s+(?=\^|>=|>)/);
    if(!clauses.length) return false;
    return clauses.every(clause=>{
      const match=clause.trim().match(/^(\^|>=|>|=)?\s*(\d+(?:\.\d+){0,2})$/);
      if(!match) return false;
      const base=versionParts(match[2]),op=match[1]||'=';
      if(op==='>=')return compare(current,base)>=0;
      if(op==='>')return compare(current,base)>0;
      if(op==='^')return current[0]===base[0]&&compare(current,base)>=0;
      // A bare major selector like "22" accepts every release of that major.
      if(op==='='&&match[2].split('.').length===1)return current[0]===base[0];
      return compare(current,base)===0;
    });
  });
}

export function checkLockIntegrity(frontendRoot=FRONTEND){
  const root=path.resolve(frontendRoot);
  const manifest=fileJson(path.join(root,'package.json'));
  const lock=fileJson(path.join(root,'package-lock.json'));
  // A v150 call protects the manifest-to-lock root; this audit checks every
  // downloaded tarball and direct locked package identity.
  checkFrontendLock(root);
  let packages=0;
  for(const [key,entry] of Object.entries(lock.packages||{})){
    if(!key)continue;
    if(!/(?:^|\/)node_modules\//.test(key)||key.startsWith('/')||
       key.split('/').some(p=>p==='.'||p==='..'||!p))fail('unsafe lock package path');
    if(!entry||typeof entry!=='object'||!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(entry.version||''))
      fail('invalid locked package version');
    if(typeof entry.resolved!=='string'||!entry.resolved.startsWith('https://registry.npmjs.org/')||
       !/^https:\/\/registry\.npmjs\.org\/[A-Za-z0-9@._/%+~-]+\.tgz$/.test(entry.resolved))
      fail('unapproved package tarball origin');
    const integrity=entry.integrity||'';
    if(!/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity)||
       Buffer.from(integrity.slice(7),'base64').length!==64)
      fail('missing or invalid SHA-512 npm integrity');
    packages++;
  }
  if(packages<40)fail('incomplete locked dependency tree');
  const required=Object.keys({...manifest.dependencies,...manifest.devDependencies}).sort();
  for(const name of required){
    const locked=lock.packages['node_modules/'+name];
    if(!locked?.version)fail('missing direct dependency in lock: '+name);
  }
  return {lockPackages:packages,directPackages:required.length};
}

function regularNonLink(p){
  try{const st=fs.lstatSync(p);return st.isFile()&&!st.isSymbolicLink();}
  catch{return false;}
}
export function inspectInstalledDependencies(frontendRoot=FRONTEND){
  const root=path.resolve(frontendRoot),manifest=fileJson(path.join(root,'package.json'));
  const lock=fileJson(path.join(root,'package-lock.json'));
  const names=Object.keys({...manifest.dependencies,...manifest.devDependencies}).sort();
  const missing=[], mismatched=[];
  for(const name of names){
    const parts=name.split('/'),modulePath=path.join(root,'node_modules',...parts);
    const manifestPath=path.join(modulePath,'package.json');
    const nodeModules=path.join(root,'node_modules');
    const scope=parts.length===2?path.join(nodeModules,parts[0]):nodeModules;
    if(!regularNonLink(manifestPath)||!fs.existsSync(modulePath)||
       fs.lstatSync(modulePath).isSymbolicLink()||
       fs.lstatSync(scope,{throwIfNoEntry:false})?.isSymbolicLink()){
      missing.push(name);continue;
    }
    let installed;
    try{installed=fileJson(manifestPath);}catch{mismatched.push(name);continue;}
    if(installed.name!==name||installed.version!==lock.packages['node_modules/'+name]?.version)
      mismatched.push(name);
  }
  const viteBin=path.join(root,'node_modules','vite','bin','vite.js');
  const viteBinary=regularNonLink(viteBin) &&
    !fs.lstatSync(path.dirname(viteBin),{throwIfNoEntry:false})?.isSymbolicLink();
  if(!viteBinary&&!missing.includes('vite')) mismatched.push('vite/bin/vite.js');
  return {totalDirect:names.length,missing,mismatched,viteBinary,
          ready:missing.length===0&&mismatched.length===0&&viteBinary};
}

export function diagnoseBuild(frontendRoot=FRONTEND,nodeVersion=process.version){
  const root=path.resolve(frontendRoot);
  const source=checkPagesSource(root);
  const lock=checkFrontendLock(root);
  const integrity=checkLockIntegrity(root);
  const locked=fileJson(path.join(root,'package-lock.json'));
  const engines={};
  for(const name of ['vite','@vitejs/plugin-react','@rolldown/plugin-babel']){
    const range=locked.packages['node_modules/'+name]?.engines?.node;
    if(!range)fail('missing locked toolchain engine');
    engines[name]={requires:range,compatible:supportsNode(range,nodeVersion)};
  }
  const runtimeCompatible=Object.values(engines).every(v=>v.compatible);
  const installed=inspectInstalledDependencies(root);
  const ready=runtimeCompatible&&installed.ready;
  return {source:'PASS',sourceDetails:source,lock:'PASS',lockDetails:lock,
    registryIntegrity:'PASS',lockPackages:integrity.lockPackages,
    runtime:runtimeCompatible?'PASS':'BLOCKED_NODE_VERSION',nodeVersion,
    engines,installedDirect:installed.totalDirect-installed.missing.length-installed.mismatched.length,
    totalDirect:installed.totalDirect,missingDirect:installed.missing,
    mismatchedDirect:installed.mismatched,viteBinary:installed.viteBinary,
    status:ready?'READY_TO_ATTEMPT_BUILD':'BLOCKED_DEPENDENCIES_OR_RUNTIME',
    viteBuild:'NOT_RUN',browserE2E:'NOT_RUN',productionReady:false};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  try{
    const result=diagnoseBuild();
    if(process.argv.includes('--json'))console.log(JSON.stringify(result,null,2));
    else {
      console.log(`v152: source/lock/tarball integrity PASS; Node ${result.runtime}; installed ${result.installedDirect}/${result.totalDirect} direct dependencies; status ${result.status}`);
      if(result.missingDirect.length)console.log('Missing: '+result.missingDirect.join(', '));
      if(result.mismatchedDirect.length)console.log('Invalid installs: '+result.mismatchedDirect.join(', '));
      console.log('Build and browser tests: NOT_RUN (run npm ci, npm run build and the real smoke test separately)');
    }
    if(process.argv.includes('--require-installed')&&result.status!=='READY_TO_ATTEMPT_BUILD')process.exitCode=2;
  }catch(err){console.error(`v152: ${err.message}; NOT PASS`);process.exitCode=1;}
}
