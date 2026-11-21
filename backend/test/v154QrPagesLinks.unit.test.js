'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {publicQueueLink,validBasePath,validLanguage,BASE_PATHS,LANGUAGES}=require('../services/v154PublicQueueLink');
const TOKEN='c'.repeat(48);
const GH='https://nurbekn.github.io';
const response=rows=>({rows,rowCount:rows.length});
const dbModule=require.resolve('../db');
require.cache[dbModule]={id:dbModule,filename:dbModule,loaded:true,exports:{}};
const {createHandlers}=require('../controllers/walkinQrController');
const barber={id:19,role:'barber',profileId:7};
function fixture(){
 const queries=[];
 const client={async query(query,args=[]){
  queries.push({query,args});
  if(query.includes('SELECT b.id FROM barbers'))return response([{id:7}]);
  if(query.includes('FROM barber_day_closures'))return response([{closed:false}]);
  if(query.includes('AS open_now'))return response([{open_now:true}]);
  if(query.includes('count(*)::int AS total'))return response([{total:0}]);
  if(query.includes('SELECT ttl_minutes FROM walkin_qr_settings'))return response([{ttl_minutes:12}]);
  if(query.includes('INSERT INTO walkin_qr_tokens'))return response([{expires_at:new Date(Date.now()+12*60000)}]);
  return response([]);
 },release(){}};
 const handlers=createHandlers({async connect(){return client;}});
 const send=async(body,requestOrigin=body.origin)=>{
  const state={status:200};
  const res={status(x){state.status=x;return this;},set(){return this;},json(body){state.body=body;return this;}};
  await handlers.tokenCreate({body,user:barber,headers:{origin:requestOrigin}},res);
  return state;
 };
 return {queries,send};
}
for(const base of BASE_PATHS){
 for(const lang of LANGUAGES){
  test(`v154 link: ${base} and ${lang} produce a canonical QR path`,()=>{
   const link=publicQueueLink(GH,TOKEN,{base_path:base,lang});
   const u=new URL(link);
   assert.equal(u.origin,GH);
   assert.equal(u.pathname,base+`queue/check-in/${TOKEN}`);
   assert.equal(u.search,`?lang=${lang}`);
   assert.equal(u.hash,'');
   assert.equal(u.searchParams.size,1);
  });
 }
}
test('v154 backwards compatibility: old client with no base/lang uses root /queue/check-in',()=>{
 assert.equal(publicQueueLink('http://localhost:5173',TOKEN),'http://localhost:5173/queue/check-in/'+TOKEN);
 assert.equal(validBasePath(undefined),'/');assert.equal(validLanguage(undefined),null);
});
test('v154 all unsafe bases are rejected; no dot-segment, encoding or open redirect',()=>{
 for(const path of ['','//evil.com/','/other/','/USTARA-New','/USTARA-New//','/USTARA-New/../','/USTARA-New/%2e%2e/','https://evil.com/',null,{},12]){
  assert.throws(()=>validBasePath(path),{status:400,code:'invalid_base_path'});
 }
});
test('v154 only public locales may appear in QR link',()=>{
 for(const value of ['UZ','',null,'uz?token=abc','uz&code=123','../../',{},5]){
  assert.throws(()=>validLanguage(value),{status:400,code:'invalid_lang'});
 }
});
test('v154 arbitrary fragments, usernames, URL query, token modifications are rejected',()=>{
 for(const origin of [GH+'/anything',GH+'?token=secret',GH+'#x','https://attacker@evil.test','javascript:foo']){
  assert.throws(()=>publicQueueLink(origin,TOKEN),{status:400,code:'invalid_qr_link'});
 }
 for(const bad of ['ABCDEF'.repeat(8),'f'.repeat(47),'f'.repeat(49),TOKEN+'?lang=en']){
  assert.throws(()=>publicQueueLink(GH,bad),{status:400,code:'invalid_qr_link'});
 }
});
test('v154 QR creation saves exact pages URL + language while token remains hashed in DB',async()=>{
 const h=fixture();
 const state=await h.send({origin:'http://localhost:5173',base_path:'/USTARA-New/',lang:'ru'});
 assert.equal(state.status,201);
 assert.match(state.body.url,/^http:\/\/localhost:5173\/USTARA-New\/queue\/check-in\/[a-f0-9]{48}\?lang=ru$/);
 assert.equal(state.body.ttl_minutes,12);
 assert.match(state.body.svg_data_uri,/^data:image\/svg\+xml;base64,/);
 const inserted=h.queries.find(x=>x.query.includes('INSERT INTO walkin_qr_tokens'));
 assert.equal(inserted.args[1].length,64);
 assert.ok(!state.body.url.includes(inserted.args[1]));
 assert.equal(h.queries.at(-1).query,'COMMIT');
});
test('v154 invalid base and locale fail BEFORE DB connect, without issuing QR',async()=>{
 const h=fixture();
 const bad=[{base_path:'/wrong/',lang:'uz'},{base_path:'//evil/',lang:'en'},
  {base_path:'/USTARA-New/',lang:'ru&token=bad'},
  {base_path:'/USTARA-New/',lang:null},
  {base_path:'/%2e%2e/',lang:'uz'}];
 for(const fields of bad){
  const result=await h.send({origin:'http://localhost:5173',...fields});
  assert.equal(result.status,400);
  assert.match(result.body.code,/^invalid_(?:base_path|lang)$/);
 }
 assert.equal(h.queries.length,0);
});
test('v154 origin policy remains strict, still no redirect to forged origin',async()=>{
 const h=fixture();
 const result=await h.send({origin:'https://evil.com',base_path:'/USTARA-New/',lang:'uz'},'http://localhost:5173');
 assert.equal(result.status,403);
 assert.equal(result.body.code,'origin_mismatch');
 assert.equal(h.queries.length,0);
});
test('v154 exact production host works only when explicitly allowed by CORS list',async()=>{
 const before={allow:process.env.CORS_ALLOWED_ORIGINS,node:process.env.NODE_ENV};
 try{
  process.env.NODE_ENV='production';
  process.env.CORS_ALLOWED_ORIGINS='https://nurbekn.github.io';
  const h=fixture();
  const result=await h.send({origin:GH,base_path:'/USTARA-New/',lang:'en'},GH);
  assert.equal(result.status,201);
  assert.match(result.body.url,/^https:\/\/nurbekn\.github\.io\/USTARA-New\/queue\/check-in\/[a-f0-9]{48}\?lang=en$/);
  const denied=await h.send({origin:'https://evil.com',base_path:'/USTARA-New/',lang:'en'},'https://evil.com');
  assert.equal(denied.status,403);assert.equal(denied.body.code,'origin_not_allowed');
 }finally{
  for(const [key,value] of [['NODE_ENV',before.node],['CORS_ALLOWED_ORIGINS',before.allow]]){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
});
test('v154 token routing still uses opaque token and no URL/locale in SQL',async()=>{
 const h=fixture();const result=await h.send({origin:'http://localhost:5173',base_path:'/USTARA-New/',lang:'uz'});
 assert.equal(result.status,201);
 assert.ok(h.queries.every(({query,args})=>!query.includes(result.body.url)&&
  !args.some(x=>typeof x==='string'&&x.includes('/USTARA-New/'))));
});
test('v154 QR source preserves Vite base in client and never embeds raw token or password into request',()=>{
 const p=path.resolve(__dirname,'../../frontend/src/pages/barber/Queue.jsx');
 const txt=fs.readFileSync(p,'utf8');
 assert.match(txt,/qrSiteDestination\(window\.location\.origin,import\.meta\.env\.BASE_URL,lang\)/);
 assert.doesNotMatch(txt,/body:\{origin:window\.location\.origin\}/);
});
