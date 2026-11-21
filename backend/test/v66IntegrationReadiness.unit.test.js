'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {verifyPagesOutput}=require('../../scripts/publish-tree-check.cjs');
const {validateJsChunkReferences}=require('../../scripts/js-chunk-check.cjs');
const {validateManifestResources}=require('../../scripts/webmanifest-check.cjs');
const {verifyCiPreflight}=require('../scripts/v66-ci-preflight');
const {validateDbEnv,verifyDbReadiness,run}=require('../scripts/v66-db-readiness');
const {expectedMigrationVersions}=require('../scripts/v40-staging');
const BASE='<!doctype html><html><head><link rel="manifest" href="/USTARA-New/site.webmanifest"></head>'+
 '<body><div id="root"></div><script type="module" src="/USTARA-New/assets/app.js"></script></body></html>';
function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v66-'));const dist=path.join(root,'dist');
 fs.mkdirSync(path.join(dist,'assets'),{recursive:true});fs.mkdirSync(path.join(dist,'icons'));
 const add=(file,content)=>fs.writeFileSync(path.join(dist,file),content);
 add('index.html',BASE);add('404.html',BASE);
 add('assets/app.js',"import{page}from'./lazy.js';const icon=new URL('../icons/a.svg',import.meta.url);");
 add('assets/lazy.js',"export const page=1;");add('icons/a.svg','<svg/>');
 add('site.webmanifest',JSON.stringify({name:'USTARA',icons:[{src:'icons/a.svg'}]}));
 try{return fn(dist,add);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('v66: compiled minified chunk, new URL asset and manifest icon are all present',()=>fixture(dist=>{
 assert.deepEqual(validateJsChunkReferences(dist),{scripts:2,dependencies:2});
 assert.deepEqual(validateManifestResources(dist,BASE),{manifests:1,assets:1});
 assert.equal(verifyPagesOutput(dist).assets,1);
}));
test('v66: missing lazy JS chunk fails release validation',()=>fixture(dist=>{
 fs.unlinkSync(path.join(dist,'assets/lazy.js'));
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v66: missing manifest icon and malformed manifest JSON fail release validation',()=>fixture((dist,add)=>{
 fs.unlinkSync(path.join(dist,'icons/a.svg'));
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
 add('icons/a.svg','<svg/>');add('site.webmanifest','{"icons":');
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v66: dynamic chunk import and re-export paths are verified',()=>fixture((dist,add)=>{
 add('assets/app.js',"import('./lazy.js'); export{x}from'./shared.js';");
 add('assets/shared.js','export const x=1;');
 assert.deepEqual(validateJsChunkReferences(dist),{scripts:3,dependencies:2});
 fs.unlinkSync(path.join(dist,'assets/shared.js'));
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v66: manifest nested shortcut icons and screenshots cannot point outside Pages',()=>fixture((dist,add)=>{
 add('site.webmanifest',JSON.stringify({icons:[{src:'icons/a.svg'}],shortcuts:[{icons:[{src:'../secrets.env'}]}]}));
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
 add('site.webmanifest',JSON.stringify({screenshots:[{src:'https://example.org/remote.png'}]}));
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
test('v66: symlinked JS chunk is rejected',()=>fixture(dist=>{
 const chunk=path.join(dist,'assets/lazy.js');fs.unlinkSync(chunk);
 fs.symlinkSync(path.join(dist,'assets/app.js'),chunk);
 assert.throws(()=>verifyPagesOutput(dist),/NOT PASS/);
}));
const SAFE_ENV={GITHUB_ACTIONS:'true',NODE_ENV:'test',GITHUB_EVENT_NAME:'push',
 GITHUB_REF:'refs/heads/main',USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test:ephemeral@127.0.0.1:5432/ustara_test_db',
 VITE_API_BASE_URL:'https://api.ustara.uz',USTARA_V40_STAGING:'I_AUTHORIZE_LOCAL_STAGING',
 USTARA_V46_STAGING:'I_AUTHORIZE_LOCAL_STAGING',USTARA_V49_STAGING:'I_AUTHORIZE_LOCAL_STAGING',
 USTARA_V53_STAGING:'I_AUTHORIZE_LOCAL_STAGING',USTARA_V54_STAGING:'I_AUTHORIZE_LOCAL_STAGING'};
test('v66: isolated CI preflight validates expected role, HTTPS origin and exact event',()=>{
 assert.equal(verifyCiPreflight(SAFE_ENV).role,'ustara_account_test');
 assert.equal(verifyCiPreflight({...SAFE_ENV,GITHUB_EVENT_NAME:'pull_request'}).event,'pull_request');
});
test('v66: CI preflight rejects production user, remote database, HTTP API and wrong branch',()=>{
 const bad=[{USTARA_TEST_DATABASE_URL:'postgresql://postgres:pw@127.0.0.1:5432/ustara_test_db'},
  {USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test:pw@db.example.org:5432/ustara_test_db'},
  {VITE_API_BASE_URL:'http://api.ustara.uz'},
  {GITHUB_REF:'refs/heads/feature'},
  {USTARA_V54_STAGING:'NO'},
  {NODE_ENV:'production'}];
 for(const entry of bad)assert.throws(()=>verifyCiPreflight({...SAFE_ENV,...entry}));
});
test('v66: db readiness rejects production URL before any connection',()=>{
 assert.throws(()=>validateDbEnv({...SAFE_ENV,USTARA_TEST_DATABASE_URL:'postgresql://postgres:pw@production.example.org/ustara_db'}));
});
const versions=expectedMigrationVersions().slice().sort();
function fakeDb({badLedger=false,badRole=false,badMetadata=false}={}){
 const log=[];
 return {log,async query(sql){log.push(sql);
  if(/SELECT current_database\(\)/.test(sql))return {rows:[{database:'ustara_test_db',session_user:'ustara_account_test',current_user:'ustara_account_test',is_superuser:false}]};
  if(/current_schema\(\) AS schema/.test(sql))return {rows:[{schema:'public',read_only:badMetadata?'off':'on',gist:true,users_present:true,offers_present:true}]};
  if(/SELECT version FROM ustara_schema_migrations/.test(sql))return {rows:(badLedger?versions.slice(1):versions).map(version=>({version}))};
  if(/FROM pg_catalog.pg_roles r/.test(sql))return {rows:[{can_login:true,superuser:badRole,inherits_owner:true,can_connect:true}]};
  throw Error('unexpected SQL in v66 fixture');
 }};
}
test('v66: read-only DB readiness validates 48 versions, isolated login user and extension',async()=>{
 const db=fakeDb();const result=await verifyDbReadiness(db,validateDbEnv(SAFE_ENV));
 assert.deepEqual(result,{database:'ustara_test_db',migrations:63,loginRole:'non_superuser',status:'PASS'});
 assert.ok(db.log.every(sql=>/^\s*SELECT\b/.test(sql)), 'only read-only SELECT');
});
test('v66: incomplete migrations, writable transaction or superuser login cannot count PASS',async()=>{
 for(const opts of [{badLedger:true},{badRole:true},{badMetadata:true}])
  await assert.rejects(verifyDbReadiness(fakeDb(opts),validateDbEnv(SAFE_ENV)),/NOT PASS|migration ledger/i);
});
test('v66: CI YAML runs preflight before npm and DB readiness before test suites',()=>{
 const yaml=fs.readFileSync(path.join(__dirname,'../../.github/workflows/v55-verify.yml'),'utf8');
 const before=yaml.indexOf('node backend/scripts/v66-ci-preflight.js');
 const install=yaml.indexOf('(cd backend && npm ci)');
 const schema=yaml.indexOf('CREATE ROLE ustara_login_test');
 const db=yaml.indexOf('node backend/scripts/v66-db-readiness.js');
 const testRunner=yaml.indexOf('(cd backend && npm test)');
 assert.ok(before>=0&&before<install&&schema<db&&db<testRunner);
});
