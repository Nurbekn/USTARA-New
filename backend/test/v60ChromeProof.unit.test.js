'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {validateBrowserTranscript}=require('../scripts/v55-release-gate');
const {summarize}=require('../scripts/v56-ci-summary');
const {browserTap}=require('./helpers/v59BrowserTapFixture');
const {publishedBrowserTap}=require('./helpers/v63PagesTapFixture');
const {assertLocalDevtoolsUrl,createCdpTransport}=require('./helpers/v60ChromeCdp');
const {sha256PublishTree}=require('../../scripts/publish-tree-check.cjs');
const root=path.resolve(__dirname,'../..');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/v55-verify.yml'),'utf8');
const tap=n=>`TAP version 13\n${Array.from({length:n},(_,i)=>`ok ${i+1} - case`).join('\n')}\n1..${n}\n# tests ${n}\n# pass ${n}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`;
const staging=require('../scripts/v55-release-gate').STAGING_FILES.map(x=>`v41 staging: ${x}: 1/1 PASS, 0 skipped`).join('\n')+'\nv54: nine real PostgreSQL suites PASS, zero SKIP.\n';
const tmp=fn=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v60-'));try{return fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}};

test('v60: browser proof demands exact nested names and plan, no extras',()=>{
 const valid=browserTap();assert.equal(validateBrowserTranscript(valid),4);
 const cases=[
  valid.replace('    1..3','    1..2'),
  valid.replace('    1..3','    1..4'),
  valid.replace('    ok 1 - customer:', '    ok 2 - customer:'),
  valid.replace('    ok 2 - barber:', '    ok 1 - barber:'),
  valid.replace('    ok 3 - admin:', '    ok 4 - admin:'),
  valid.replace('    # Subtest: barber:', '    # Subtest: customer:'),
  valid.replace('    ok 2 - barber:', '    ok 2 - customer:'),
  valid.replace('    ok 3 - admin:', '    ok 3 - unknown:'),
  valid.replace('# tests 4','# tests 5').replace('# pass 4','# pass 5'),
  valid.replace('    1..3','    ok 4 - additional test\n    1..4'),
  valid.replace('ok 1 - Login E2E:','ok 2 - Login E2E:'),
  valid + '    ok 9 - forged hidden scenario\n',
 ];
 for(const invalid of cases)assert.throws(()=>validateBrowserTranscript(invalid),/NOT PASS/);
});

test('v60: redacted report binds actual publish tree and asset counts to release proof',()=>tmp(dir=>{
 const dist=path.join(dir,'dist');fs.mkdirSync(path.join(dist,'assets'),{recursive:true});
 fs.writeFileSync(path.join(dist,'index.html'),'<script type="module" src="/USTARA-New/assets/main.js"></script>');
 fs.writeFileSync(path.join(dist,'assets/main.js'),'console.log(1)');
 fs.writeFileSync(path.join(dir,'backend.tap'),tap(1));fs.writeFileSync(path.join(dir,'frontend.tap'),tap(2));
 fs.writeFileSync(path.join(dir,'staging.log'),staging);fs.writeFileSync(path.join(dir,'browser.tap'),browserTap());fs.writeFileSync(path.join(dir,'published-browser.tap'),publishedBrowserTap());
 const valid={ciGate:'PASS',productionReady:false,postgresSuites:9,browserTests:4,publishBrowserTests:4,backendUnit:1,frontendUnit:2,
  decisions:185,forwardMigrations:48,publishFiles:2,frontendJsAssets:1,publishTreeSha256:sha256PublishTree(dist)};
 const save=() =>fs.writeFileSync(path.join(dir,'release.json'),JSON.stringify(valid));save();
 assert.equal(summarize(dir,dist).releaseGate,'PASS');
 valid.publishFiles=3;save();assert.equal(summarize(dir,dist).releaseGate,'NOT_VERIFIED');
 valid.publishFiles=2;valid.frontendJsAssets=2;save();assert.equal(summarize(dir,dist).releaseGate,'NOT_VERIFIED');
 valid.frontendJsAssets=1;save();
 fs.writeFileSync(path.join(dist,'.env.local'),'secret-material');
 assert.equal(summarize(dir,dist).releaseGate,'NOT_VERIFIED');
 fs.unlinkSync(path.join(dist,'.env.local'));
 assert.equal(summarize(dir,dist).releaseGate,'PASS');
}));

test('v60: Chrome DevTools address cannot redirect to another host, port, or protocol',()=>{
 assert.equal(assertLocalDevtoolsUrl('ws://127.0.0.1:3333/devtools/page/A-b_4'.replace('_4','-4'),3333),
   'ws://127.0.0.1:3333/devtools/page/A-b-4');
 for(const bad of ['wss://127.0.0.1:3333/devtools/page/ok',
  'ws://localhost:3333/devtools/page/ok','ws://127.0.0.1:4444/devtools/page/ok',
  'ws://user:pass@127.0.0.1:3333/devtools/page/ok','ws://127.0.0.1:3333/devtools/browser/ok',
  'ws://127.0.0.1:3333/devtools/page/ok?evil=1','file:///tmp/nowhere',undefined])
  assert.throws(()=>assertLocalDevtoolsUrl(bad,3333),/Chrome DevTools/);
});

class MockSocket extends EventTarget{
 constructor(){super();this.readyState=1;this.sent=[];}
 send(value){this.sent.push(JSON.parse(value));}
 close(){this.readyState=3;this.dispatchEvent(new Event('close'));}
 reply(value){const evt=new Event('message');evt.data=JSON.stringify(value);this.dispatchEvent(evt);}
}
test('v60: bounded CDP calls resolve, reject server errors and clean pending state',async()=>{
 const ws=new MockSocket(),cdp=createCdpTransport(ws,{timeoutMs:100});
 const good=cdp.send('Page.enable');const id=ws.sent.at(-1).id;
 ws.reply({id,result:{ready:true}});assert.deepEqual(await good,{ready:true});assert.equal(cdp.pendingCount,0);
 const bad=cdp.send('Page.navigate',{url:'x'});
 ws.reply({id:ws.sent.at(-1).id,error:{message:'private-response'}});
 await assert.rejects(bad,/CDP command failed/);assert.equal(cdp.pendingCount,0);
 await assert.rejects(cdp.send('invalid'),/Invalid CDP method/);
 cdp.close();await assert.rejects(cdp.send('Page.enable'),/unavailable/);
});

test('v60: CDP pending requests time out; Chrome close rejects requests immediately',async()=>{
 const ws=new MockSocket(),cdp=createCdpTransport(ws,{timeoutMs:15});
 await assert.rejects(cdp.send('Page.enable'),/timed out/);
 assert.equal(cdp.pendingCount,0);
 const pending=cdp.send('Page.navigate');ws.close();
 await assert.rejects(pending,/closed/);
 assert.equal(cdp.pendingCount,0);
});

test('v60: Node Chrome integration actually uses bounded CDP transport and loopback guard',()=>{
 const src=fs.readFileSync(path.join(root,'backend/test/login.browser.e2e.test.js'),'utf8');
 assert.match(src,/assertLocalDevtoolsUrl\(tabs\.find/);
 assert.match(src,/createCdpTransport\(ws\)/);
 assert.match(src,/AbortSignal\.timeout\(5000\)/);
 assert.match(src,/chromeExited\(chrome\)/);
 assert.match(src,/stopChrome\(chrome\)/);
 assert.match(src,/--remote-debugging-address=127\.0\.0\.1/);
 assert.match(workflow,/node --test test\/login\.browser\.e2e\.test\.js/);
});
