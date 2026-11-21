'use strict';
// v210: Linux/POSIX process-tree regression checks; no PostgreSQL required.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {captureTap, ABORT_CLOSE_GRACE_MS, PROCESS_TIMEOUT_MS} = require('../scripts/v208-integration-exit-gate.cjs');

const canSignalGroup = process.platform !== 'win32';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function spawnWithInheritingGrandchild(dir, mode) {
  const ready = path.join(dir, 'grandchild-ready');
  const marker = path.join(dir, 'grandchild-survived');
  const grandchildScript = `
    const fs=require('node:fs');
    fs.writeFileSync(${JSON.stringify(ready)},'started');
    setTimeout(()=>fs.writeFileSync(${JSON.stringify(marker)},'ORPHAN'),1800);
    setTimeout(()=>{},4000);
  `;
  const action = mode === 'parent-exits'
    ? 'process.stdout.write("parent finished\\n");process.exit(0);'
    : mode === 'overflow'
      ? 'process.stdout.write("x".repeat(20000));'
      : 'process.stdout.write("parent active\\n");';
  const program = `
    const fs=require('node:fs');
    const {spawn}=require('node:child_process');
    spawn(process.execPath,['-e',${JSON.stringify(grandchildScript)}],{stdio:'inherit'});
    const pending=setInterval(()=>{
      if(fs.existsSync(${JSON.stringify(ready)})){
        clearInterval(pending);
        ${action}
      }
    },10);
    setTimeout(()=>{},4000);
  `;
  return {ready, marker, program};
}

function workdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ustara-v210-pgroup-')); }

test('v210: process group timeout has a bounded close watchdog', () => {
  assert.ok(ABORT_CLOSE_GRACE_MS >= 100 && ABORT_CLOSE_GRACE_MS <= 3000);
  assert.ok(PROCESS_TIMEOUT_MS < 30*60*1000);
});
test('v210: ordinary passing subprocess output remains fully captured', async () => {
  const tap = await captureTap({command:process.execPath,args:['-e','process.stdout.write("TAP version 13\\n")'],timeoutMs:3000});
  assert.equal(tap, 'TAP version 13\n');
});
test('v210: parent process exiting nonzero still fails closed', async () => {
  await assert.rejects(captureTap({command:process.execPath,args:['-e','process.exit(2)'],timeoutMs:3000}),/nonzero exit or signal/);
});
test('v210: already-existing/invalid subprocess path fails closed', async () => {
  await assert.rejects(captureTap({command:'/missing/path/v210',args:[],timeoutMs:300}),/spawn error/);
});
test('v210: timeout SIGKILLs descendants retaining inherited TAP pipes', {skip:!canSignalGroup, timeout:10000}, async () => {
  const dir=workdir();
  try {
    const {ready,marker,program}=spawnWithInheritingGrandchild(dir,'timeout');
    const started=Date.now();
    await assert.rejects(captureTap({command:process.execPath,args:['-e',program],timeoutMs:600}),/timeout/);
    assert.ok(Date.now()-started < 3500, 'timeout cannot hang on descendant stdout');
    assert.equal(fs.existsSync(ready),true,'descendant actually started');
    await delay(1900);
    assert.equal(fs.existsSync(marker),false,'grandchild must not outlive cancelled test');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('v210: early successful parent exit cannot hide an inherited-pipe grandchild', {skip:!canSignalGroup, timeout:10000}, async () => {
  const dir=workdir();
  try {
    const {ready,marker,program}=spawnWithInheritingGrandchild(dir,'parent-exits');
    const started=Date.now();
    await assert.rejects(captureTap({command:process.execPath,args:['-e',program],timeoutMs:600}),/timeout/);
    assert.ok(Date.now()-started < 3500);
    assert.equal(fs.existsSync(ready),true);
    await delay(1900);
    assert.equal(fs.existsSync(marker),false,'inherited stdout holder must be killed');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('v210: oversized TAP terminates whole group, not only parent', {skip:!canSignalGroup, timeout:10000}, async () => {
  const dir=workdir();
  try {
    const {ready,marker,program}=spawnWithInheritingGrandchild(dir,'overflow');
    const started=Date.now();
    await assert.rejects(captureTap({command:process.execPath,args:['-e',program],maxBytes:1024,timeoutMs:1600}),/oversized TAP output/);
    assert.ok(Date.now()-started < 3500);
    assert.equal(fs.existsSync(ready),true);
    await delay(1900);
    assert.equal(fs.existsSync(marker),false,'oversize TAP must kill descendant');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('v210: manual CI workflow runs process-group regression gate before DB setup', () => {
  const workflow=fs.readFileSync(path.resolve(__dirname,'../../.github/workflows/v193-isolated-postgres-booking.yml'),'utf8');
  assert.match(workflow,/^on:\s*\n\s*workflow_dispatch:/m);
  assert.match(workflow,/npm run test:v213:unit/);
  assert.match(workflow,/node scripts\/v208-integration-exit-gate\.cjs/);
  assert.ok(workflow.indexOf('npm run test:v213:unit') < workflow.indexOf('Create disposable non-superuser DB'));
});
