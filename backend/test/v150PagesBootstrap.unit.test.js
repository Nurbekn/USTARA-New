'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {verifyPagesOutput,validateUstaraBootstrapAssets}=require('../../scripts/publish-tree-check.cjs');
const HTML=`<!doctype html><html><head><link rel="stylesheet" href="/USTARA-New/loading.css"><link rel="icon" type="image/svg+xml" href="/USTARA-New/brand/ustara.svg"></head><body><div class="app-loading app-loading--screen"><img src="/USTARA-New/brand/ustara.svg"><p id="ustara-boot-status">Yuklanmoqda…</p><small id="ustara-boot-detail">Iltimos, biroz kuting</small></div><script defer src="/USTARA-New/bootstrap-locale.js"></script><script type="module" src="/USTARA-New/assets/app.js"></script></body></html>`;
function fixture(fn){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v150-build-'));
 const dist=path.join(folder,'dist');
 fs.mkdirSync(path.join(dist,'assets'),{recursive:true});fs.mkdirSync(path.join(dist,'brand'));
 const put=(rel,value)=>fs.writeFileSync(path.join(dist,rel),value);
 put('index.html',HTML);put('404.html',HTML);
 put('loading.css','.app-loading{mask:url("brand/ustara.svg")}');
 put('brand/ustara.svg','<svg xmlns="http://www.w3.org/2000/svg"></svg>');
 put('assets/app.js','console.log("compiled")');
 put('bootstrap-locale.js','document.documentElement.lang="uz";');
 try{return fn(dist,put);}finally{fs.rmSync(folder,{recursive:true,force:true});}
}
test('v150: built app with real prefixed icon, stylesheet, loader image and SPA fallback passes',()=>fixture(dist=>{
 assert.equal(validateUstaraBootstrapAssets(dist,HTML),4);
 assert.deepEqual(verifyPagesOutput(dist),{assets:1,files:6});
}));
test('v150: a root-absolute loading.css in real built HTML fails even with valid JS',()=>fixture((dist,put)=>{
 const broken=HTML.replace('/USTARA-New/loading.css','/loading.css');
 put('index.html',broken);put('404.html',broken);
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v150: missing original favicon link is a hard release failure',()=>fixture((dist,put)=>{
 const broken=HTML.replace('<link rel="icon" type="image/svg+xml" href="/USTARA-New/brand/ustara.svg">','');
 put('index.html',broken);put('404.html',broken);
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v150: missing initial loader image is a hard release failure',()=>fixture((dist,put)=>{
 const broken=HTML.replace('<img src="/USTARA-New/brand/ustara.svg">','');
 put('index.html',broken);put('404.html',broken);
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v150: missing stylesheet or branded favicon file blocks publishing',()=>fixture((dist,put)=>{
 fs.unlinkSync(path.join(dist,'loading.css'));
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
 put('loading.css','body{}');fs.unlinkSync(path.join(dist,'brand/ustara.svg'));
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v150: CSS brand dependency missing cannot bypass verified publish checks',()=>fixture((dist,put)=>{
 put('loading.css','.app-loading{mask:url("brand/missing.svg")}');
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v150: SPA fallback must be byte-identical to the compiled index.html',()=>fixture((dist,put)=>{
 put('404.html',HTML.replace('app-loading--screen','other'));
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v150: source code Pages source gate exists and verified CI uses it before install',()=>{
 const ci=fs.readFileSync(path.resolve(__dirname,'../../.github/workflows/v55-verify.yml'),'utf8');
 assert.match(ci,/v150 package-free Pages bootstrap/);
 assert.ok(ci.indexOf('v150 package-free Pages bootstrap')<ci.indexOf('Install backend and frontend from locks'));
});
