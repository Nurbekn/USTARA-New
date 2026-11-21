'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {validateCssResources,resolveCssRef}=require('../../scripts/css-resource-check.cjs');
const {verifyPagesOutput,sha256PublishTree}=require('../../scripts/publish-tree-check.cjs');
const {monitorLocalAssetFailures}=require('./helpers/v64ChromeRoutes');
const {lookupPath,servePages}=require('./helpers/v63StaticPages');
const HTML=`<!doctype html><html><head><link rel="stylesheet" href="/USTARA-New/assets/app.css"><link rel="manifest" href="/USTARA-New/site.webmanifest"></head><body><picture><source srcset="/USTARA-New/img/one.webp 1x, /USTARA-New/img/two.webp 2x"><img src="/USTARA-New/img/one.webp"></picture><script type="module" src="/USTARA-New/assets/app.js"></script></body></html>`;
function fixture(run){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v65-'));
 const dist=path.join(root,'dist');
 for(const dir of ['assets','img','fonts'])fs.mkdirSync(path.join(dist,dir),{recursive:true});
 const add=(rel,contents)=>fs.writeFileSync(path.join(dist,rel),contents);
 add('index.html',HTML);add('404.html',HTML);add('site.webmanifest','{"name":"USTARA"}');
 add('assets/app.js','console.log("ok")');add('assets/app.css','@import "child.css"; .foo{background:url("../img/one.webp")}');
 add('assets/child.css','.foo{src:url("../fonts/a.woff2") }');
 add('fonts/a.woff2','WOFF2 FONT');add('img/one.webp','image1');add('img/two.webp','image2');
 try{return run(dist,add);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('v65: HTML responsive srcset, web-manifest and nested CSS dependencies are all checked',()=>fixture(dist=>{
 assert.deepEqual(validateCssResources(dist,HTML),{stylesheets:2,dependencies:3});
 assert.deepEqual(verifyPagesOutput(dist),{assets:1,files:9});
 assert.match(sha256PublishTree(dist),/^[a-f0-9]{64}$/);
}));
test('v65: missing nested CSS font makes a nominally valid Vite entry fail',()=>fixture(dist=>{
 fs.unlinkSync(path.join(dist,'fonts/a.woff2'));
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v65: missing responsive image or PWA manifest fails pre-deploy',()=>fixture((dist,add)=>{
 fs.unlinkSync(path.join(dist,'img/two.webp'));
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
 add('img/two.webp','back');fs.unlinkSync(path.join(dist,'site.webmanifest'));
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v65: CSS safe data/fragment/remote https URLs are not mistaken for missing local files',()=>fixture((dist,add)=>{
 add('assets/child.css',`.x{background:url(data:image/png;base64,abc)} .y{fill:url(#gradient)} .z{src:url(https://fonts.example.org/f.woff2)}`);
 assert.deepEqual(validateCssResources(dist,HTML),{stylesheets:2,dependencies:2});
}));
test('v65: CSS path traversal, insecure URL, protocol-relative, invalid encoding are blocked',()=>fixture((dist,add)=>{
 const bad=['/other/logo.png','http://other.example/logo.png','//cdn.example/logo.png',
  '/USTARA-New/%2e%2e/.env','file:///etc/passwd','%zz'];
 for(const url of bad){
  add('assets/child.css',`.x{background:url("${url}")}`);
  assert.throws(()=>validateCssResources(dist,HTML),/NOT PASS/,url);
 }
}));
test('v65: CSS symlink and empty image are never treated as built dependencies',()=>fixture((dist,add)=>{
 fs.unlinkSync(path.join(dist,'fonts/a.woff2'));
 fs.symlinkSync(path.join(dist,'img/one.webp'),path.join(dist,'fonts/a.woff2'));
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
 fs.unlinkSync(path.join(dist,'fonts/a.woff2'));
 add('fonts/a.woff2','');
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v65: CSS @import cycle and repeated dependency are bounded',()=>fixture((dist,add)=>{
 add('assets/child.css','@import "app.css"; .x{background:url("../fonts/a.woff2")}');
 assert.deepEqual(validateCssResources(dist,HTML),{stylesheets:2,dependencies:4});
}));
test('v65: local CSS resolver accepts normal relative paths but rejects escaping root',()=>fixture(dist=>{
 const base=path.join(dist,'assets','app.css');
 assert.equal(resolveCssRef(dist,base,'../fonts/a.woff2'),path.join(dist,'fonts/a.woff2'));
 assert.throws(()=>resolveCssRef(dist,base,'../../secret.env'),/NOT PASS/);
}));
function channel(){
 const callbacks=new Set();return {addEventListener:(event,cb)=>{if(event==='message')callbacks.add(cb);},
 removeEventListener:(event,cb)=>{if(event==='message')callbacks.delete(cb);},
 send:(method,params)=>{for(const cb of callbacks)cb({data:JSON.stringify({method,params})});}};
}
test('v65: Chrome local 404 stylesheet/JS is a hard failure',()=>{
 const ws=channel(),m=monitorLocalAssetFailures(ws,'http://127.0.0.1:1234');
 ws.send('Network.requestWillBeSent',{requestId:'a',type:'Stylesheet',request:{url:'http://127.0.0.1:1234/USTARA-New/assets/app.css'}});
 ws.send('Network.responseReceived',{requestId:'a',response:{status:404}});
 assert.equal(m.errors,1);assert.throws(()=>m.assertClean(),/asset load failed/);m.stop();
});
test('v65: Chrome local failed font is detected, remote fonts and blocked API fetch ignored',()=>{
 const ws=channel(),m=monitorLocalAssetFailures(ws,'http://127.0.0.1:1234');
 ws.send('Network.requestWillBeSent',{requestId:'a',type:'Font',request:{url:'https://fonts.example.com/a.woff2'}});
 ws.send('Network.loadingFailed',{requestId:'a'});
 ws.send('Network.requestWillBeSent',{requestId:'b',type:'Fetch',request:{url:'http://127.0.0.1:1234/api/user'}});
 ws.send('Network.loadingFailed',{requestId:'b'});
 assert.equal(m.errors,0);m.assertClean();
 ws.send('Network.requestWillBeSent',{requestId:'c',type:'Font',request:{url:'http://127.0.0.1:1234/USTARA-New/fonts/a.woff2'}});
 ws.send('Network.loadingFailed',{requestId:'c'});
 assert.equal(m.errors,1);assert.throws(()=>m.assertClean(),/asset load failed/);m.stop();
});
test('v65: browser 404 script is detected even without a requestWillBeSent type',()=>{
 const ws=channel(),m=monitorLocalAssetFailures(ws,'http://127.0.0.1:1234');
 ws.send('Network.requestWillBeSent',{requestId:'l',request:{url:'http://127.0.0.1:1234/USTARA-New/assets/app.js'}});
 ws.send('Network.responseReceived',{requestId:'l',response:{status:404,url:'http://127.0.0.1:1234/USTARA-New/assets/app.js'}});
 assert.throws(()=>m.assertClean(),/asset load failed/);m.stop();
});
test('v65: Chrome network monitor rejects non-loopback origins',()=>{
 const ws=channel();for(const origin of ['https://example.com','http://localhost:1234','http://0.0.0.0:1234'])
  assert.throws(()=>monitorLocalAssetFailures(ws,origin),/loopback/);
});
test('v65: static browser fixture maps webmanifest and fonts, blocks traversal',()=>fixture(dist=>{
 assert.equal(lookupPath(dist,'/USTARA-New/site.webmanifest')?.type,'application/manifest+json');
 assert.equal(lookupPath(dist,'/USTARA-New/fonts/a.woff2')?.type,'font/woff2');
 for(const u of ['/USTARA-New/%2e%2e/index.html','/USTARA-New/../index.html','/USTARA-New/%5c.env'])
  assert.equal(lookupPath(dist,u),null);
}));
test('v65: real localhost HTTP asset fixture serves manifest without fallback/secret exposure',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v65-http-'));
 const dist=path.join(root,'dist');fs.mkdirSync(dist);
 fs.writeFileSync(path.join(dist,'index.html'),'<div id="root"></div>');
 fs.writeFileSync(path.join(dist,'404.html'),'<div id="root"></div>');
 fs.writeFileSync(path.join(dist,'site.webmanifest'),'{}');
 const server=await servePages(dist);
 try{
  const r=await fetch(server.url+'/USTARA-New/site.webmanifest');
  assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/application\/manifest\+json/);
  assert.equal((await fetch(server.url+'/USTARA-New/secret.txt')).status,404);
 }finally{await server.close();fs.rmSync(root,{recursive:true,force:true});}
});
