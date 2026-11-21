'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const ci=fs.readFileSync(path.join(ROOT,'.github/workflows/v55-verify.yml'),'utf8');
const frontend=path.join(ROOT,'frontend');
test('v152: new lock and first-paint preflight precedes npm ci',()=>{
 const before=ci.indexOf('v152 package-free lock integrity and first-paint');
 const install=ci.indexOf('Install backend and frontend from locks');
 const after=ci.indexOf('v152 verify installed frontend dependencies');
 const realBuild=ci.indexOf('Build real Vite frontend');
 assert.ok(before>=0&&before<install&&install<after&&after<realBuild);
});
test('v152: CI never interprets source validation as a successful Vite build',()=>{
 assert.match(ci,/v152-build-doctor\.mjs --require-installed/);
 assert.match(ci,/v152-first-paint-smoke\.mjs --json/);
 assert.match(ci,/\(cd frontend && npm run build\)/);
 assert.match(ci,/verify-pages-build\.mjs frontend\/dist/);
});
test('v152: npm frontend scripts call only existing package-free preflights',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(frontend,'package.json'),'utf8'));
 assert.equal(pkg.scripts['preflight:build'],'node scripts/v152-build-doctor.mjs');
 assert.equal(pkg.scripts['preflight:first-paint'],'node scripts/v152-first-paint-smoke.mjs');
 assert.equal(pkg.scripts.build,'vite build');
});
test('v152: build doctor CLI explicitly records real build NOT_RUN',()=>{
 const r=spawnSync(process.execPath,['scripts/v152-build-doctor.mjs','--json'],{cwd:frontend,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 const data=JSON.parse(r.stdout);
 assert.equal(data.registryIntegrity,'PASS');
 assert.equal(data.viteBuild,'NOT_RUN');
 assert.equal(data.browserE2E,'NOT_RUN');
 assert.equal(data.productionReady,false);
});
test('v152: browserless smoke is not presented as Chromium E2E',()=>{
 const r=spawnSync(process.execPath,['scripts/v152-first-paint-smoke.mjs','--json'],{cwd:frontend,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 const data=JSON.parse(r.stdout);
 assert.equal(data.result,'PASS');
 assert.equal(data.kind,'BROWSERLESS_VM_NOT_CHROME');
});
test('v152: no production npm bypass flags in verified CI',()=>{
 assert.doesNotMatch(ci,/--(?:force|legacy-peer-deps|ignore-scripts|omit=dev)/);
});
