'use strict';
// Offline and isolated: only a disposable test-only git repo is written.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync,execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {assertCheckedSourceTree,readGuardedStatus,GUARDED_PATHS} = require('../scripts/v220-checked-source-tree-gate.cjs');
const root=path.resolve(__dirname,'../..');
const wf=path.join(root,'.github/workflows/v193-isolated-postgres-booking.yml');
const SHA='a'.repeat(40);
const CI=Object.freeze({
  GITHUB_ACTIONS:'true', GITHUB_RUN_ID:'220000',GITHUB_RUN_ATTEMPT:'1',
  GITHUB_SHA:SHA,GITHUB_REPOSITORY:'Nurbekn/USTARA-New',
  GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_WORKFLOW_REF:'Nurbekn/USTARA-New/.github/workflows/v193-isolated-postgres-booking.yml@refs/heads/main',
  GITHUB_WORKSPACE:'/checked/out',
});
const fake=Object.freeze({checkoutRoot:'/checked/out',resolvePath:value=>value,readHead:()=>SHA});

function fixture(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v220-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:directory,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-q');
  for(const filepath of GUARDED_PATHS) {
    if (!['.github', 'backend'].includes(filepath)) {
      fs.mkdirSync(path.dirname(path.join(directory,filepath)),{recursive:true});
      fs.writeFileSync(path.join(directory,filepath),'baseline\n');
    } else {
      fs.mkdirSync(path.join(directory,filepath),{recursive:true});
      fs.writeFileSync(path.join(directory,filepath,'fixture.txt'),'baseline\n');
    }
  }
  // The broad backend/ guard must cover tracked dependencies and untracked code.
  fs.writeFileSync(path.join(directory,'backend/package-lock.json'),'baseline\n');
  fs.writeFileSync(path.join(directory,'backend/package.json'),'baseline\n');
  fs.mkdirSync(path.join(directory,'backend/scripts'),{recursive:true});
  fs.writeFileSync(path.join(directory,'backend/scripts/fixture.cjs'),'baseline\n');
  fs.writeFileSync(path.join(directory,'README.md'),'unrelated documentation\n');
  git('add','.');
  git('-c','user.email=unit@example.invalid','-c','user.name=CI Unit Test','commit','-qm','test fixture');
  return {directory,git};
}

test('v220: correct commit and clean source tree pass without disclosing SHA',()=>{
  assert.deepEqual(assertCheckedSourceTree(CI,{...fake,readStatus:()=>''}),{commitBound:true,guardedTreeClean:true});
});
test('v220: staged and unstaged modifications are both rejected',()=>{
  for(const report of [' M backend/package-lock.json\n','M  backend/package.json\n']) {
    assert.throws(()=>assertCheckedSourceTree(CI,{...fake,readStatus:()=>report}),/v220/);
  }
});
test('v220: untracked scripts and migrations are rejected',()=>{
  assert.throws(()=>assertCheckedSourceTree(CI,{...fake,readStatus:()=> '?? backend/scripts/untracked.cjs\n'}),/v220/);
});
test('v220: status failure, non-string result and oversized output fail closed',()=>{
  assert.throws(()=>assertCheckedSourceTree(CI,{...fake,readStatus:()=>{throw Error('git failed');}}),/v220/);
  assert.throws(()=>assertCheckedSourceTree(CI,{...fake,readStatus:()=>undefined}),/v220/);
});
test('v220: wrong GitHub identity or mismatched HEAD never consults worktree',()=>{
  let touched=false;
  const readStatus=()=>{touched=true;return '';};
  assert.throws(()=>assertCheckedSourceTree({...CI,GITHUB_EVENT_NAME:'push'},{...fake,readStatus}));
  assert.throws(()=>assertCheckedSourceTree(CI,{...fake,readHead:()=> 'b'.repeat(40),readStatus}));
  assert.equal(touched,false);
});
test('v220: real git porcelain detects changed tracked, staged, and untracked guarded files',t=>{
  const {directory,git}=fixture(t);
  assert.equal(readGuardedStatus(directory),'');
  const tracked=path.join(directory,'backend/package-lock.json');
  fs.appendFileSync(tracked,'changed\n');
  assert.match(readGuardedStatus(directory),/backend\/package-lock\.json/);
  git('add','backend/package-lock.json');
  assert.match(readGuardedStatus(directory),/backend\/package-lock\.json/);
  git('restore','--staged','backend/package-lock.json');
  git('restore','backend/package-lock.json');
  fs.writeFileSync(path.join(directory,'backend/scripts/new.cjs'),'untracked');
  assert.match(readGuardedStatus(directory),/backend\/scripts\/new\.cjs/);
  fs.rmSync(path.join(directory,'backend/scripts/new.cjs'));
  fs.mkdirSync(path.join(directory,'backend/routes'),{recursive:true});
  fs.writeFileSync(path.join(directory,'backend/routes/untracked.js'),'untracked');
  assert.match(readGuardedStatus(directory),/backend\/routes\/untracked\.js/);
});
test('v220: real git checkout SHA and clean worktree pass together',t=>{
  const {directory,git}=fixture(t);
  const realCi={...CI,GITHUB_SHA:git('rev-parse','HEAD'),GITHUB_WORKSPACE:directory};
  assert.deepEqual(assertCheckedSourceTree(realCi,{checkoutRoot:directory}),
    {commitBound:true,guardedTreeClean:true});
  fs.appendFileSync(path.join(directory,'backend/package.json'),'changed\n');
  assert.throws(()=>assertCheckedSourceTree(realCi,{checkoutRoot:directory}),/v220/);
});
test('v220: root npm config and workflow mutations are guarded',t=>{
  const {directory}=fixture(t);
  fs.writeFileSync(path.join(directory,'.npmrc'),'ignore-scripts=false\n');
  assert.match(readGuardedStatus(directory),/\.npmrc/);
  fs.rmSync(path.join(directory,'.npmrc'));
  fs.mkdirSync(path.join(directory,'.github/workflows'),{recursive:true});
  fs.writeFileSync(path.join(directory,'.github/workflows/new.yml'),'new workflow\n');
  assert.match(readGuardedStatus(directory),/new\.yml/);
});
test('v220: unrelated README edits are outside this focused CI code gate',t=>{
  const {directory}=fixture(t);
  fs.appendFileSync(path.join(directory,'README.md'),'edited\n');
  assert.equal(readGuardedStatus(directory),'');
});
test('v220: workflow checks source tree before npm and again before DB creation',()=>{
  const contents=fs.readFileSync(wf,'utf8');
  const first=contents.indexOf('node backend/scripts/v220-checked-source-tree-gate.cjs');
  const install=contents.indexOf('- name: Install backend dependencies exactly as locked');
  const unit=contents.indexOf('npm run test:v220:unit');
  const second=contents.lastIndexOf('node backend/scripts/v220-checked-source-tree-gate.cjs');
  const create=contents.indexOf('- name: Create disposable non-superuser DB');
  assert.ok(first>0 && first<install && install<unit && unit<second && second<create);
  assert.equal(contents.match(/run: node backend\/scripts\/v220-checked-source-tree-gate\.cjs/g)?.length,2);
  assert.match(contents,/^on:\s*\n\s*workflow_dispatch:/m);
  assert.doesNotMatch(contents,/\b(push|pull_request|schedule):/);
});
test('v220: standalone source tree gate fails safely outside GitHub Actions',()=>{
  const output=spawnSync(process.execPath,[path.join(root,'backend/scripts/v220-checked-source-tree-gate.cjs')],{
    env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000,
  });
  assert.equal(output.status,1);
  assert.match(output.stderr,/BLOCKED/);
  assert.doesNotMatch(output.stderr+output.stdout,/a{40}|postgresql:\/\//);
});
