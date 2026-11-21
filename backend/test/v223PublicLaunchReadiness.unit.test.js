'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createReleaseReadiness,REQUIRED_RELATIONS}=require('../controllers/releaseReadiness');
const {runLaunchSmoke,parsePublicOrigin}=require('../../scripts/launch-smoke.cjs');
function response(){return {code:0, headers:{},set(key,value){this.headers[key]=value;return this;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
test('v223: read-only readiness checks core migration + booking + Telegram relations',async()=>{
  let q;
  const handler=createReleaseReadiness({pool:{async query(config){q=config;return {rows:[{ready:true}]};}}});
  const res=response();await handler({},res);
  assert.equal(res.code,200);assert.deepEqual(res.body,{status:'ready'});
  assert.equal(res.headers['Cache-Control'],'no-store');
  assert.match(q.text,/to_regclass/);assert.match(q.text,/unnest/);
  assert.equal(q.query_timeout,5000);
  assert.deepEqual(q.values[0],REQUIRED_RELATIONS);
  for(const name of ['users','bookings','booking_request_keys','telegram_webhook_receipts','ustara_schema_migrations'])
    assert.ok(REQUIRED_RELATIONS.includes('public.'+name));
  assert.doesNotMatch(q.text,/DELETE|INSERT|UPDATE|DROP|TRUNCATE/i);
});
test('v223: missing schema and database errors fail closed without exposing details',async()=>{
  for(const query of [async()=>({rows:[{ready:false}]}),async()=>{throw Error('secret database host');},async()=>({rows:[]})]){
    const res=response();await createReleaseReadiness({pool:{query}})({},res);
    assert.equal(res.code,503);assert.deepEqual(res.body,{status:'not_ready'});
    assert.doesNotMatch(JSON.stringify(res.body),/secret|users|postgres/i);
  }
});
test('v223: main server exposes readiness separately from simple health',()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  assert.match(server,/app\.get\('\/api\/ready', require\('\.\/controllers\/releaseReadiness'\)/);
  assert.match(server,/app\.get\("\/api\/health"/);
});
test('v223: public origins reject tokens, HTTP and subpaths',()=>{
  assert.equal(parsePublicOrigin('https://ustara.pages.dev','Frontend'),'https://ustara.pages.dev');
  for(const bad of ['http://host.example','https://u:p@host.example','https://host.example/api','https://host.example/?token=abc','https://localhost','https://127.0.0.1','no-url']) {
    assert.throws(()=>parsePublicOrigin(bad,'Frontend'));
  }
});
function httpResponse({status=200, type='application/json', body={}, cors}){
  return {ok:status>=200&&status<300,status,
    headers:{get(name){return name==='content-type'?type:name==='access-control-allow-origin'?cors:null;}},
    async json(){return body;},async text(){return body;}};
}
const BUILT_HTML='<!doctype html><div id="root"></div><script type="module" crossorigin src="/assets/app-HASH.js"></script><link rel="stylesheet" href="/assets/app-HASH.css">';
function validPublicResponse(url,options,site){
  if(options.method==='OPTIONS')return httpResponse({cors:site});
  if(url.endsWith('/assets/app-HASH.js'))return httpResponse({type:'text/javascript',body:'console.log(1)'});
  if(url.endsWith('/assets/app-HASH.css'))return httpResponse({type:'text/css',body:'body{}'});
  if(url.startsWith(site))return httpResponse({type:'text/html; charset=utf-8',body:BUILT_HTML});
  if(url.endsWith('/api/barbers'))return httpResponse({body:[],cors:site});
  return httpResponse({body:url.endsWith('/ready')?{status:'ready'}:{message:'alive'}});
}
test('v223: public smoke check tests built assets, directory, health, schema readiness and CORS',async()=>{
  const calls=[];const site='https://ustara.pages.dev', api='https://api.ustara.example';
  const checked=await runLaunchSmoke(site,api,async(url,options)=>{
    calls.push({url,options});return validPublicResponse(url,options,site);
  });
  assert.equal(checked.length,9);
  assert.deepEqual(calls.map(({url})=>url),[site+'/',site+'/assets/app-HASH.js',site+'/assets/app-HASH.css',
    site+'/login',site+'/barbers',api+'/api/health',api+'/api/ready',api+'/api/barbers',api+'/api/barbers']);
  assert.equal(calls[7].options.headers.Origin,site);
  assert.equal(calls[8].options.headers.Origin,site);
});
test('v223: missing bundle, unready schema, broken directory or missing CORS fail closed',async()=>{
  const site='https://ustara.pages.dev',api='https://api.ustara.example';
  const fixtures=[
    (url,options)=> url.endsWith('/api/ready')?httpResponse({status:503}):validPublicResponse(url,options,site),
    (url,options)=> url.endsWith('/login')?httpResponse({type:'text/html',body:'Error page'}):validPublicResponse(url,options,site),
    (url,options)=> options.method==='OPTIONS'?httpResponse({cors:'https://another.example'}):validPublicResponse(url,options,site),
    (url,options)=> url.endsWith('/assets/app-HASH.js')?httpResponse({type:'text/html',body:BUILT_HTML}):validPublicResponse(url,options,site),
    (url,options)=> url.endsWith('/api/barbers') && options.method==='GET'?httpResponse({status:500}):validPublicResponse(url,options,site),
    (url,options)=> url.endsWith('/api/barbers') && options.method==='GET'?httpResponse({body:[],cors:'https://another.example'}):validPublicResponse(url,options,site),
  ];
  for(const fixture of fixtures)await assert.rejects(runLaunchSmoke(site,api,async(url,options)=>fixture(url,options)));
});
