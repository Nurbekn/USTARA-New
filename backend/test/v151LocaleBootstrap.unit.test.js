'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {verifyPagesOutput,validateUstaraBootstrapAssets}=require('../../scripts/publish-tree-check.cjs');
const FRONT=path.resolve(__dirname,'../../frontend');
const original=fs.readFileSync(path.join(FRONT,'index.html'),'utf8')
 .replaceAll('%BASE_URL%','/USTARA-New/')
 .replace('<script type="module" src="/src/main.jsx"></script>', '<script type="module" src="/USTARA-New/assets/app.js"></script>');
function fixture(run){
 const dist=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v151-build-'));
 const put=(name,value)=>{const p=path.join(dist,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,value);};
 put('index.html',original);put('404.html',original);
 put('loading.css',fs.readFileSync(path.join(FRONT,'public/loading.css')));
 put('brand/ustara.svg',fs.readFileSync(path.join(FRONT,'public/brand/ustara.svg')));
 put('bootstrap-locale.js',fs.readFileSync(path.join(FRONT,'public/bootstrap-locale.js')));
 put('assets/app.js','/* compiled fixture entry for validator unit test, NOT a real Vite build */');
 try{return run({dist,put});}finally{fs.rmSync(dist,{recursive:true,force:true});}
}
test('v151: signed release tree needs exactly the local locale bootstrap source',()=>fixture(({dist})=>{
 assert.equal(validateUstaraBootstrapAssets(dist,original),4);
 assert.deepEqual(verifyPagesOutput(dist),{assets:1,files:6});
}));
test('v151: missing locale bootstrap JS blocks build artifact publication',()=>fixture(({dist})=>{
 fs.rmSync(path.join(dist,'bootstrap-locale.js'));
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v151: non-Pages rooted locale script is blocked even if present',()=>fixture(({dist,put})=>{
 const wrong=original.replace('/USTARA-New/bootstrap-locale.js','/bootstrap-locale.js');
 put('index.html',wrong);put('404.html',wrong);
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v151: missing locale script tag is a release gate failure',()=>fixture(({dist,put})=>{
 const wrong=original.replace(/<script defer src="\/USTARA-New\/bootstrap-locale\.js"><\/script>/,'');
 put('index.html',wrong);put('404.html',wrong);
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v151: omitted locale placeholder is rejected',()=>fixture(({dist,put})=>{
 const wrong=original.replace('id="ustara-boot-status"','id="not-present"');
 put('index.html',wrong);put('404.html',wrong);
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v151: second locale script is rejected by publish asset count policy',()=>fixture(({dist,put})=>{
 const double=original.replace('</head>','<script defer src="/USTARA-New/bootstrap-locale.js"></script></head>');
 put('index.html',double);put('404.html',double);
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v151: published SPA fallback must remain byte-identical with localized entry',()=>fixture(({dist,put})=>{
 put('404.html',original.replace('ustara-boot-status','other'));
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
