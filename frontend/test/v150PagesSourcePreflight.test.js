import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {checkPagesSource,checkFrontendLock,checkInstalledToolchain} from '../scripts/v150-pages-source-check.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function fixture(run){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v150-'));
  const files=['index.html','vite.config.js','src/main.jsx','public/loading.css','public/brand/ustara.svg','public/bootstrap-locale.js','package.json','package-lock.json'];
  for(const name of files){
    fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});
    fs.copyFileSync(path.join(ROOT,name),path.join(root,name));
  }
  const edit=(name,fn)=>{
    const file=path.join(root,name),original=fs.readFileSync(file,'utf8');
    fs.writeFileSync(file,fn(original));
  };
  try{return run(root,edit);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('v150: actual Pages HTML, Vite base, router, CSS and public assets are consistent',()=>{
  assert.deepEqual(checkPagesSource(ROOT),{base:'/USTARA-New/',htmlAssets:4,entry:1,cssRefs:2});
});
test('v150: real package manifest and lock match, with a Vite build script',()=>{
  const lock=checkFrontendLock(ROOT);
  assert.equal(lock.lockfile,3);assert.match(lock.viteLocked,/^8\./);
});
test('v150: dependency report never mislabels unavailable local Vite as a successful build',()=>{
  const status=checkInstalledToolchain(ROOT);
  assert.equal(status.buildPossible,status.viteInstalled);
  assert.equal(typeof status.viteInstalled,'boolean');
});
test('v150: initial loader stylesheet root-absolute URL is rejected',()=>fixture((root,edit)=>{
  edit('index.html',s=>s.replace('%BASE_URL%loading.css','/loading.css'));
  assert.throws(()=>checkPagesSource(root),/NOT PASS/);
}));
test('v150: initial favicon root-absolute URL is rejected',()=>fixture((root,edit)=>{
  edit('index.html',s=>s.replace('href="%BASE_URL%brand/ustara.svg"','href="/brand/ustara.svg"'));
  assert.throws(()=>checkPagesSource(root),/NOT PASS/);
}));
test('v150: initial loader IMG wrong base is rejected',()=>fixture((root,edit)=>{
  edit('index.html',s=>s.replace('src="%BASE_URL%brand/ustara.svg"','src="/brand/ustara.svg"'));
  assert.throws(()=>checkPagesSource(root),/NOT PASS/);
}));
test('v150: missing referenced source stylesheet must fail before npm install',()=>fixture((root)=>{
  fs.unlinkSync(path.join(root,'public/loading.css'));
  assert.throws(()=>checkPagesSource(root),/NOT PASS/);
}));
test('v150: stylesheet reference to a non-existing brand file is rejected',()=>fixture((root,edit)=>{
  edit('public/loading.css',s=>s.replaceAll('brand/ustara.svg','brand/missing.svg'));
  assert.throws(()=>checkPagesSource(root),/NOT PASS/);
}));
test('v150: CSS root-relative URL is rejected under GitHub Pages base',()=>fixture((root,edit)=>{
  edit('public/loading.css',s=>s.replaceAll('brand/ustara.svg','/brand/ustara.svg'));
  assert.throws(()=>checkPagesSource(root),/NOT PASS/);
}));
test('v150: source traversal and remote scripts cannot be introduced into bootstrap',()=>fixture((root,edit)=>{
  edit('index.html',s=>s.replace('%BASE_URL%loading.css','%BASE_URL%../loading.css'));
  assert.throws(()=>checkPagesSource(root),/NOT PASS/);
  edit('index.html',s=>s.replace('%BASE_URL%../loading.css','%BASE_URL%loading.css').replace('/src/main.jsx','https://evil.example/script.js'));
  assert.throws(()=>checkPagesSource(root),/NOT PASS/);
}));
test('v150: wrong Vite public base is rejected even when source assets exist',()=>fixture((root,edit)=>{
  edit('vite.config.js',s=>s.replace("base: '/USTARA-New/'","base: '/'"));
  assert.throws(()=>checkPagesSource(root),/NOT PASS/);
}));
test('v150: wrong React Router basename is rejected',()=>fixture((root,edit)=>{
  edit('src/main.jsx',s=>s.replace('basename={import.meta.env.BASE_URL}','basename="/"'));
  assert.throws(()=>checkPagesSource(root),/NOT PASS/);
}));
test('v150: a missing module entry cannot claim a publishable frontend',()=>fixture((root,edit)=>{
  edit('index.html',s=>s.replace('src="/src/main.jsx"','src="/missing.jsx"'));
  assert.throws(()=>checkPagesSource(root),/NOT PASS/);
}));
test('v150: lock drift fails rather than forcing a non-reproducible npm install',()=>fixture((root,edit)=>{
  edit('package.json',s=>s.replace('"react": "^19.3.1"','"react": "^19.0.0"'));
  assert.throws(()=>checkFrontendLock(root),/NOT PASS/);
}));
test('v150: lock missing Vite is rejected even if manifest claims build support',()=>fixture((root,edit)=>{
  edit('package-lock.json',s=>{const o=JSON.parse(s);delete o.packages['node_modules/vite'];return JSON.stringify(o);});
  assert.throws(()=>checkFrontendLock(root),/NOT PASS/);
}));
test('v150: preflight reports source PASS independently of whether npm packages are installed',()=>{
  const command=spawnSync(process.execPath,['scripts/v150-pages-source-check.mjs','--json'],{cwd:ROOT,encoding:'utf8'});
  assert.equal(command.status,0,command.stderr);
  const data=JSON.parse(command.stdout);
  assert.equal(data.source,'PASS');assert.equal(data.lock,'PASS');
  assert.ok(['BLOCKED_MISSING_VITE','PRESENT'].includes(data.toolchain));
});
test('v150: --require-deps is fail-closed when Vite is missing, useful in verified CI',()=>{
  const command=spawnSync(process.execPath,['scripts/v150-pages-source-check.mjs','--require-deps'],{cwd:ROOT,encoding:'utf8'});
  assert.equal(command.status,checkInstalledToolchain(ROOT).viteInstalled?0:2);
});
test('v150: CI runs source preflight before npm ci and requires installed tools afterward',()=>{
  const ci=fs.readFileSync(path.join(ROOT,'..','.github/workflows/v55-verify.yml'),'utf8');
  const before=ci.indexOf('v150 package-free Pages bootstrap');
  const install=ci.indexOf('Install backend and frontend from locks');
  const after=ci.indexOf('v150 require real installed Vite');
  const audit=ci.indexOf('Offline structural audit');
  assert.ok(before>=0 && before<install && install<after && after<audit);
  assert.match(ci,/v150-pages-source-check\.mjs --require-deps/);
});
