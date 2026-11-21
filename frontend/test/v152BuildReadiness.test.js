import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {supportsNode,checkLockIntegrity,inspectInstalledDependencies,diagnoseBuild} from '../scripts/v152-build-doctor.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v152-deps-'));
 for(const item of ['package.json','package-lock.json','index.html','vite.config.js','src/main.jsx','public/loading.css','public/brand/ustara.svg','public/bootstrap-locale.js']){
  const to=path.join(root,item);fs.mkdirSync(path.dirname(to),{recursive:true});
  fs.copyFileSync(path.join(ROOT,item),to);
 }
 const json=(file,mutate)=>{const p=path.join(root,file),obj=JSON.parse(fs.readFileSync(p));
  mutate(obj);fs.writeFileSync(p,JSON.stringify(obj));};
 try{return fn(root,json);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
for(const [range,node,expected] of [
 ['^20.19.0 || >=22.12.0','v22.16.0',true],
 ['^20.19.0 || >=22.12.0','v22.11.0',false],
 ['>=22.12.0 || ^24.0.0','v20.19.0',false],
 ['>=22.12.0 || ^24.0.0','v22.16.0',true],
 ['>=22.12.0 || ^24.0.0','v24.0.0',true],
 ['^20.19.0','v20.18.9',false],
 ['^20.19.0','v20.20.0',true],
 ['^20.19.0','v21.0.0',false],
 ['>=22.12.0','bad-version',false],
 ['*','v22.16.0',false],
 ]){
 test(`v152: toolchain engine ${range}, Node ${node} => ${expected}`,()=>assert.equal(supportsNode(range,node),expected));
}
test('v152: all locked frontend tarball origins and SHA-512 integrities pass',()=>{
 const result=checkLockIntegrity();assert.ok(result.lockPackages>160);assert.ok(result.directPackages>10);
});
test('v152: non-registry tarball in lock must fail closed',()=>fixture((root,json)=>{
 json('package-lock.json',o=>{o.packages['node_modules/vite'].resolved='https://evil.example/vite.tgz';});
 assert.throws(()=>checkLockIntegrity(root),/NOT PASS/);
}));
test('v152: missing or weak integrity must fail closed',()=>fixture((root,json)=>{
 json('package-lock.json',o=>{o.packages['node_modules/vite'].integrity='sha1-abc';});
 assert.throws(()=>checkLockIntegrity(root),/NOT PASS/);
}));
test('v152: lock traversal paths must fail closed',()=>fixture((root,json)=>{
 json('package-lock.json',o=>{o.packages['../node_modules/malice']=o.packages['node_modules/react'];});
 assert.throws(()=>checkLockIntegrity(root),/NOT PASS/);
}));
test('v152: lock missing direct dependency must fail closed',()=>fixture((root,json)=>{
 json('package-lock.json',o=>{delete o.packages['node_modules/leaflet'];});
 assert.throws(()=>checkLockIntegrity(root),/NOT PASS/);
}));
test('v152: a lock altered without updating package json is rejected',()=>fixture((root,json)=>{
 json('package.json',o=>{o.dependencies.react='^18.0.0';});
 assert.throws(()=>checkLockIntegrity(root),/NOT PASS/);
}));
test('v152: source PASS does NOT mean Vite installed or production build PASS',()=>{
 const report=diagnoseBuild(ROOT);
 assert.equal(report.source,'PASS');assert.equal(report.lock,'PASS');
 assert.equal(report.registryIntegrity,'PASS');assert.equal(report.viteBuild,'NOT_RUN');
 assert.equal(report.browserE2E,'NOT_RUN');assert.equal(report.productionReady,false);
 assert.equal(report.runtime,'PASS');
 assert.ok(report.totalDirect>=17);
});
test('v152: incompatible Node version is a BLOCKER despite valid sources',()=>{
 const report=diagnoseBuild(ROOT,'v20.19.0');
 assert.equal(report.runtime,'BLOCKED_NODE_VERSION');
 assert.equal(report.engines['@rolldown/plugin-babel'].compatible,false);
 assert.equal(report.status,'BLOCKED_DEPENDENCIES_OR_RUNTIME');
});
test('v152: empty node_modules is BLOCKED, not a fake PASS',()=>fixture(root=>{
 const report=diagnoseBuild(root);
 assert.equal(report.installedDirect,0);
 assert.equal(report.status,'BLOCKED_DEPENDENCIES_OR_RUNTIME');
 assert.equal(report.missingDirect.length,report.totalDirect);
}));
test('v152: a single correct React package does not imply complete installation',()=>fixture(root=>{
 const p=path.join(root,'node_modules/react/package.json');fs.mkdirSync(path.dirname(p),{recursive:true});
 fs.writeFileSync(p,JSON.stringify({name:'react',version:'19.3.1'}));
 const installed=inspectInstalledDependencies(root);
 assert.ok(!installed.missing.includes('react'));assert.equal(installed.ready,false);
}));
test('v152: wrong installed version must be reported, never mistaken for source PASS',()=>fixture(root=>{
 const p=path.join(root,'node_modules/react/package.json');fs.mkdirSync(path.dirname(p),{recursive:true});
 fs.writeFileSync(p,JSON.stringify({name:'react',version:'18.0.0'}));
 assert.ok(inspectInstalledDependencies(root).mismatched.includes('react'));
}));
test('v152: symlinked package metadata must fail the installation gate',()=>fixture(root=>{
 const p=path.join(root,'node_modules/react/package.json');fs.mkdirSync(path.dirname(p),{recursive:true});
 fs.symlinkSync(path.join(root,'package.json'),p);
 assert.ok(inspectInstalledDependencies(root).missing.includes('react'));
}));
test('v152: Vite package metadata alone cannot prove runnable Vite binary',()=>fixture(root=>{
 const p=path.join(root,'node_modules/vite/package.json');fs.mkdirSync(path.dirname(p),{recursive:true});
 fs.writeFileSync(p,JSON.stringify({name:'vite',version:'8.3.5'}));
 const status=inspectInstalledDependencies(root);
 assert.equal(status.viteBinary,false);assert.ok(status.mismatched.includes('vite/bin/vite.js'));
}));
test('v152: --json gives a redacted, machine-readable BLOCKED result without secrets',()=>{
 const child=spawnSync(process.execPath,['scripts/v152-build-doctor.mjs','--json'],{cwd:ROOT,encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);
 const result=JSON.parse(child.stdout);
 assert.equal(result.viteBuild,'NOT_RUN');assert.equal(result.productionReady,false);
 assert.doesNotMatch(child.stdout,/process\.env|password|token|HOME=|\/home\/oai/);
});
test('v152: --require-installed gates real CI when build tools are missing',()=>{
 const child=spawnSync(process.execPath,['scripts/v152-build-doctor.mjs','--require-installed'],{cwd:ROOT,encoding:'utf8'});
 const ready=inspectInstalledDependencies().ready;
 assert.equal(child.status,ready?0:2,child.stderr);
});
