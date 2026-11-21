'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {chromeBinary,chromeExited,stopChrome}=require('./helpers/v61ChromeLifecycle');
const {parseTapSummary}=require('../scripts/v40-staging');
const {browserTap}=require('./helpers/v59BrowserTapFixture');
const {validatePublishTree,verifyPagesOutput}=require('../../scripts/publish-tree-check.cjs');
const root=path.resolve(__dirname,'../..');
class Child extends EventEmitter{
 constructor(ignoreTerm=false){super();this.pid=901;this.exitCode=null;this.signalCode=null;this.signals=[];this.ignoreTerm=ignoreTerm;}
 kill(signal){this.signals.push(signal);
  if(signal==='SIGTERM'&&this.ignoreTerm)return true;
  this.signalCode=signal;queueMicrotask(()=>this.emit('exit',null,signal));return true;
 }
}
test('v61 Chrome executable is one of three allowlisted browsers, never shell or absolute path',()=>{
 assert.equal(chromeBinary({}),'google-chrome');
 for(const good of ['chromium','chromium-browser','google-chrome'])
  assert.equal(chromeBinary({USTARA_CHROME_BINARY:good}),good);
 for(const bad of ['/bin/sh','bash -c id','google-chrome --remote-debugging-address=0.0.0.0','/usr/bin/chromium'])
  assert.throws(()=>chromeBinary({USTARA_CHROME_BINARY:bad}),/Unsupported/);
});
test('v61 cleanup does not await an exit that already happened by SIGTERM',async()=>{
 const child=new Child();child.signalCode='SIGTERM';
 assert.equal(chromeExited(child),true);
 await Promise.race([stopChrome(child),new Promise((_,reject)=>setTimeout(()=>reject(Error('cleanup hung')),100))]);
 assert.deepEqual(child.signals,[]);
});
test('v61 normal Chrome shutdown sends TERM and completes on exit',async()=>{
 const child=new Child();await stopChrome(child,{graceMs:20,forceMs:20});
 assert.deepEqual(child.signals,['SIGTERM']);
});
test('v61 stuck Chrome shutdown is bounded and escalates to SIGKILL',async()=>{
 const child=new Child(true);
 await stopChrome(child,{graceMs:10,forceMs:20});
 assert.deepEqual(child.signals,['SIGTERM','SIGKILL']);
});
test('v61 Chrome launch failure without PID is not killed and deadline input is validated',async()=>{
 const child=new Child();child.pid=undefined;
 await stopChrome(child,{graceMs:10,forceMs:10});assert.deepEqual(child.signals,[]);
 await assert.rejects(stopChrome(child,{graceMs:0}),/deadline/);
});
test('v61 browser E2E binds Chrome debug port to loopback and handles spawn error',()=>{
 const src=fs.readFileSync(path.join(root,'backend/test/login.browser.e2e.test.js'),'utf8');
 const ci=fs.readFileSync(path.join(root,'.github/workflows/v55-verify.yml'),'utf8');
 assert.match(src,/--remote-debugging-address=127\.0\.0\.1/);
 assert.match(src,/chrome\.on\('error'/);
 assert.match(src,/await stopChrome\(chrome\)/);
 assert.match(ci,/USTARA_CHROME_BINARY=google-chrome/);
 assert.match(ci,/USTARA_CHROME_BINARY=chromium/);
 assert.match(ci,/node --test test\/login\.browser\.e2e\.test\.js/);
 assert.ok(ci.indexOf('if command -v google-chrome')<ci.indexOf('node --test test/login.browser.e2e.test.js'));
});
test('v61 TAP parser accepts real nested Chrome coverage and rejects nested failure/skip',()=>{
 const good=browserTap();assert.equal(parseTapSummary(good).tests,4);
 assert.throws(()=>parseTapSummary(good.replace('    ok 1 - customer:','    not ok 1 - customer:')),/NOT PASS/);
 assert.throws(()=>parseTapSummary(good.replace('    ok 2 - barber:', '    ok 2 - barber: # SKIP ')),/NOT PASS/);
 assert.throws(()=>parseTapSummary(good.replace('    ok 3 - admin:', '    ok 3 - admin: # TODO ')),/NOT PASS/);
});
test('v61 TAP parser rejects summary with more PASS than witnessed test results',()=>{
 const forged='TAP version 13\nok 1 - real test\n1..1\n# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
 assert.throws(()=>parseTapSummary(forged),/NOT PASS/);
});
function tempTree(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v61-'));
 try{const dist=path.join(dir,'dist');fs.mkdirSync(path.join(dist,'assets'),{recursive:true});
  const html='<script type="module" src="/USTARA-New/assets/main.js"></script>';
  fs.writeFileSync(path.join(dist,'index.html'),html);
  fs.writeFileSync(path.join(dist,'404.html'),html);
  fs.writeFileSync(path.join(dist,'assets','main.js'),'console.log(1)');
  return fn(dist,dir);
 }finally{fs.rmSync(dir,{force:true,recursive:true});}
}
test('v61 Pages rejects unusual hidden files, uppercase source maps and backup secrets',()=>tempTree(dist=>{
 assert.deepEqual(verifyPagesOutput(dist),{assets:1,files:3});
 for(const name of ['.htaccess','.ENV','PRIVATE.MAP','credentials.PEM','backup.sql','debug.LOG','archive.BAK']){
  fs.writeFileSync(path.join(dist,name),'SENSITIVE');
  assert.throws(()=>validatePublishTree(dist),/NOT PASS/);
  fs.rmSync(path.join(dist,name));
 }
 fs.writeFileSync(path.join(dist,'.nojekyll'),'');
 assert.equal(validatePublishTree(dist),4);
}));
test('v61 Pages rejects oversized artifacts and a symlink root',()=>tempTree((dist,dir)=>{
 const huge=path.join(dist,'assets','huge.js');fs.writeFileSync(huge,'');fs.truncateSync(huge,25*1024*1024+1);
 assert.throws(()=>validatePublishTree(dist),/NOT PASS/);
 fs.rmSync(huge);
 fs.symlinkSync(dist,path.join(dir,'link'));
 assert.throws(()=>validatePublishTree(path.join(dir,'link')),/NOT PASS/);
}));
