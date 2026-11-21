'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const {verifyPagesOutput,validateHtmlAssetReferences,sha256PublishTree}=require('../../scripts/publish-tree-check.cjs');
const {assertNavigation,waitForRoute,monitorRuntimeExceptions}=require('./helpers/v64ChromeRoutes');
const ROOT=path.resolve(__dirname,'../..');
const HTML='<!doctype html><html><head><link rel="stylesheet" href="/USTARA-New/assets/main.css">'
 + '<link rel="icon" href="/USTARA-New/brand/logo.svg"><link rel="modulepreload" href="/USTARA-New/assets/chunk.js">'
 + '<link rel="preconnect" href="https://fonts.googleapis.com">'
 + '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet"></head>'
 + '<body><img src="/USTARA-New/brand/logo.svg"><script type="module" src="/USTARA-New/assets/app.js"></script></body></html>';
function temp(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v64-'));
 const dist=path.join(dir,'dist');fs.mkdirSync(path.join(dist,'assets'),{recursive:true});
 fs.mkdirSync(path.join(dist,'brand'));
 for(const [name,content] of [['assets/app.js','console.log("app")'],['assets/chunk.js','export const x=1;'],
  ['assets/main.css','body{display:block}'],['brand/logo.svg','<svg></svg>'],['index.html',HTML],['404.html',HTML]])
  fs.writeFileSync(path.join(dist,name),content);
 try{return fn(dist,dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('v64: every script, stylesheet, modulepreload, icon and HTML image must exist',()=>temp(dist=>{
 assert.equal(validateHtmlAssetReferences(dist,HTML),5);
 assert.deepEqual(verifyPagesOutput(dist),{assets:1,files:6});
 assert.match(sha256PublishTree(dist),/^[a-f0-9]{64}$/);
}));
test('v64: missing CSS or icon invalidates an otherwise valid built JavaScript entry',()=>temp(dist=>{
 fs.unlinkSync(path.join(dist,'assets/main.css'));
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
 fs.writeFileSync(path.join(dist,'assets/main.css'),'body{}');
 fs.unlinkSync(path.join(dist,'brand/logo.svg'));
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v64: wrong base, remote scripts, missing preload and encoded traversal are rejected',()=>temp(dist=>{
 const cases=[
  HTML.replace('/USTARA-New/assets/main.css','/assets/main.css'),
  HTML.replace('/USTARA-New/assets/app.js','https://example.com/app.js'),
  HTML.replace('/USTARA-New/assets/chunk.js','/USTARA-New/assets/missing.js'),
  HTML.replace('/USTARA-New/assets/main.css','/USTARA-New/%2e%2e/main.css'),
  HTML.replace('/USTARA-New/brand/logo.svg','/USTARA-New/%2fetc/passwd'),
  HTML.replace('/USTARA-New/assets/main.css','http://example.com/app.css')
 ];
 for(const html of cases)assert.throws(()=>validateHtmlAssetReferences(dist,html),/NOT PASS/);
}));
test('v64: symlink or empty resource fails, query and fragment on safe links remain supported',()=>temp((dist,dir)=>{
 fs.symlinkSync(path.join(dist,'assets/main.css'),path.join(dist,'assets/alias.css'));
 assert.throws(()=>validateHtmlAssetReferences(dist,HTML.replace('main.css','alias.css')),/NOT PASS/);
 fs.writeFileSync(path.join(dist,'assets/main.css'),'');
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
 fs.writeFileSync(path.join(dist,'assets/main.css'),'body{}');
 assert.equal(validateHtmlAssetReferences(dist,HTML.replace('main.css','main.css?v=123#style')),5);
}));
test('v64: Chrome Page.navigate must have a real frame and no errorText',()=>{
 assert.equal(assertNavigation({frameId:'frame-1',loaderId:'loader'}),true);
 for(const result of [null,{}, {frameId:''},{frameId:'frame-1',errorText:'net::ERR_ABORTED'}])
  assert.throws(()=>assertNavigation(result),/navigation failed/);
});
test('v64: production readiness checks the correct route, never only a stale DOM selector',async()=>{
 let polls=0;
 const evaluate=async expression=>{
  assert.match(expression,/location\.pathname === "\/USTARA-New\/admin"/);
  assert.match(expression,/document\.querySelector/);
  return ++polls===3;
 };
 assert.equal(await waitForRoute(evaluate,'/USTARA-New/admin','!!document.querySelector("form")',
  {attempts:5,pollMs:0,pause:async()=>{}}),true);
 assert.equal(polls,3);
});
test('v64: transient navigation CDP errors retry, persistent failures fail closed',async()=>{
 let attempts=0;
 const ok=await waitForRoute(async()=>{attempts++;
  if(attempts===1)throw Error('CDP command failed');return true;
 },'/USTARA-New/login','!!document.body',{attempts:3,pollMs:0,pause:async()=>{}});
 assert.equal(ok,true);assert.equal(attempts,2);
 await assert.rejects(waitForRoute(async()=>{throw Error('CDP command failed');},
  '/USTARA-New/login','!!document.body',{attempts:2,pollMs:0,pause:async()=>{}}),/did not become ready/);
 await assert.rejects(waitForRoute(async()=>{throw Error('Chrome CDP unavailable');},
  '/USTARA-New/login','!!document.body',{attempts:2,pollMs:0,pause:async()=>{}}),/Chrome CDP unavailable/);
});
test('v64: browser runtime JavaScript exceptions stop a falsely green smoke',()=>{
 const emitter=new EventEmitter();
 const ws={addEventListener:(event,fn)=>emitter.on(event,fn),removeEventListener:(event,fn)=>emitter.off(event,fn)};
 const probe=monitorRuntimeExceptions(ws);
 assert.doesNotThrow(()=>probe.assertClean());
 emitter.emit('message',{data:JSON.stringify({method:'Runtime.consoleAPICalled'})});
 assert.doesNotThrow(()=>probe.assertClean());
 emitter.emit('message',{data:JSON.stringify({method:'Runtime.exceptionThrown',params:{exceptionDetails:{text:'secret redacted'}}})});
 assert.equal(probe.errors,1);
 assert.throws(()=>probe.assertClean(),/runtime exception/);
 probe.stop();emitter.emit('message',{data:JSON.stringify({method:'Runtime.exceptionThrown'})});
 assert.equal(probe.errors,1);
});
test('v64: production Chrome smoke is guarded by exact routes and JS exception monitor',()=>{
 const script=fs.readFileSync(path.join(ROOT,'backend/test/pagesBuild.browser.e2e.test.js'),'utf8');
 assert.match(script,/waitForRoute\(evaluate,'\/USTARA-New\/login'/);
 assert.match(script,/waitForRoute\(evaluate,'\/USTARA-New\/admin'/);
 assert.match(script,/waitForRoute\(evaluate,'\/USTARA-New\/forgot-password'/);
 assert.match(script,/runtimeErrors\.assertClean\(\)/);
 const ci=fs.readFileSync(path.join(ROOT,'.github/workflows/v55-verify.yml'),'utf8');
 assert.ok(ci.indexOf('Create and check the CI-built SPA fallback')<ci.indexOf('Release evidence gate — fail closed'));
});
