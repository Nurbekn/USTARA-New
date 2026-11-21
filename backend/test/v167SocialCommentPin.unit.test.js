'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
const {createHandlers,safeId}=require('../controllers/commentPinV167');
function response(){return {statusCode:200,body:null,headers:{},status(x){this.statusCode=x;return this;},json(x){this.body=x;return this;},set(k,v){this.headers[k]=v;return this;}};}
function request({role='barber',accountId=5,postId='17',commentId='30',pinned=true,body={pinned}}={}){
 return {user:{role,accountId,profileId:99},params:{id:postId,commentId},body};
}
function pinFake({owner=true,comment=true,commentPinned=false,commitFailure=false}={}) {
 const queries=[],released=[];
 const client={
  async query(sql,args=[]){queries.push({sql,args});
   if(sql==='BEGIN'||sql==='ROLLBACK'||sql.startsWith('SET LOCAL'))return {rowCount:0,rows:[]};
   if(sql==='COMMIT'){if(commitFailure)throw Error('uncertain commit');return {rowCount:0,rows:[]};}
   if(sql.startsWith('SELECT p.id FROM social_posts'))return {rowCount:owner?1:0,rows:owner?[{id:17}]:[]};
   if(sql.startsWith('SELECT id,pinned FROM social_comments'))return {rowCount:comment?1:0,rows:comment?[{id:30,pinned:commentPinned}]:[]};
   if(sql.startsWith('UPDATE social_comments'))return {rowCount:1,rows:[]};
   throw Error('Unexpected SQL '+sql);
  },release(broken){released.push(broken===true);},
 };
 return {queries,released,db:{connect:async()=>client}};
}
async function run(fake,req=request()){const res=response();await createHandlers(fake.db).setPin(req,res);return res;}
test('#82 pin API refuses anonymous/customer, extra body and unsafe ids before any DB query',async()=>{
 for(const req of [request({role:'customer'}),request({accountId:0}),request({commentId:'01'}),request({postId:'0'}),request({body:{pinned:true,barberId:9}}),request({body:{pinned:1}})]){
  const fake=pinFake(),res=await run(fake,req);assert.ok([400,403].includes(res.statusCode));assert.equal(fake.queries.length,0);
 }
 assert.equal(safeId('001'),null);assert.equal(safeId('9007199254740992'),null);assert.equal(safeId('17'),17);
});
test('#82 pin requires own approved post, correct comment, no changes on missing targets',async()=>{
 for(const opts of [{owner:false},{comment:false}]){
  const fake=pinFake(opts),res=await run(fake);assert.equal(res.statusCode,404);
  assert.ok(fake.queries.find(q=>q.sql==='ROLLBACK'));assert.equal(fake.queries.some(q=>q.sql.startsWith('UPDATE social_comments')),false);
 }
});
test('#82 pin is serialized under real account ownership and changes at most one visible pinned comment',async()=>{
 const f=pinFake(),r=await run(f);assert.equal(r.statusCode,200);
 assert.deepEqual(r.body,{postId:17,commentId:30,pinned:true});
 assert.equal(f.queries.filter(q=>q.sql.startsWith('UPDATE social_comments')).length,2);
 const owner=f.queries.find(q=>q.sql.includes('FROM social_posts'));
 assert.deepEqual(owner.args,[17,5]);assert.match(owner.sql,/b\.user_id=\$2/);assert.match(owner.sql,/FOR UPDATE OF p/);
 assert.ok(f.queries.indexOf(f.queries.find(q=>q.sql==='COMMIT')) > f.queries.indexOf(f.queries.find(q=>q.sql.startsWith('UPDATE social_comments'))));
 assert.deepEqual(f.released,[false]);assert.equal(r.headers['Cache-Control'],'no-store');
});
test('#82 unpin idempotent, and only an actually pinned comment is changed',async()=>{
 const fresh=pinFake({commentPinned:false}),r=await run(fresh,request({pinned:false}));
 assert.equal(r.statusCode,200);assert.equal(fresh.queries.filter(q=>q.sql.startsWith('UPDATE social_comments')).length,0);
 const prev=pinFake({commentPinned:true}),other=await run(prev,request({pinned:false}));
 assert.equal(other.statusCode,200);assert.equal(prev.queries.filter(q=>q.sql.startsWith('UPDATE social_comments')).length,1);
});
test('#82 uncertain transaction commit cannot report success or retry',async()=>{
 const f=pinFake({commitFailure:true}),r=await run(f);
 assert.equal(r.statusCode,503);assert.deepEqual(f.released,[true]);
 assert.equal(f.queries.filter(q=>q.sql==='COMMIT').length,1);
 assert.equal(f.queries.filter(q=>q.sql==='ROLLBACK').length,0);
});
function loadSocialWithDb(db){
 const filename=require.resolve('../controllers/socialController');
 const compiled=new Module(filename,module);compiled.filename=filename;compiled.paths=module.paths;
 compiled.require=(name)=>name==='../db'?db:require(name);
 compiled._compile(fs.readFileSync(filename,'utf8'),filename);
 return compiled.exports;
}
function socialFake({recent=0,byPost=0,repeated=false}={}){
 const queries=[],released=[];
 const client={async query(sql,args=[]){queries.push({sql,args});
  if(sql==='BEGIN'||sql==='ROLLBACK'||sql==='COMMIT'||sql.startsWith('SET LOCAL'))return {rowCount:0,rows:[]};
  if(sql.startsWith('SELECT p.id FROM social_posts'))return {rowCount:1,rows:[{id:17}]};
  if(sql.includes('FROM social_comments')&&sql.includes("INTERVAL '10 minutes'"))return {rowCount:1,rows:[{recent_total:recent,recent_post:byPost,repeated}]};
  if(sql.startsWith('INSERT INTO social_comments'))return {rowCount:1,rows:[{id:41,text:'Excellent work!',created_at:'2026-11-20T11:00:00Z'}]};
  if(sql.startsWith('SELECT COALESCE(b.first_name'))return {rowCount:1,rows:[{first_name:'User'}]};
  if(sql.startsWith('SELECT count(*)::int AS count FROM social_comments'))return {rowCount:1,rows:[{count:3}]};
  throw Error('Unexpected SQL '+sql);
 },release(){released.push(true);}};
 return {queries,released,db:{connect:async()=>client}};
}
test('#82 comment spam protection refuses repeated same text and burst; no insert',async()=>{
 for(const args of [{repeated:true},{recent:10},{byPost:5}]){
  const f=socialFake(args),handler=loadSocialWithDb(f.db).addComment,res=response();
  await handler({user:{role:'customer',accountId:5},params:{id:'17'},body:{text:'Excellent work!'}},res);
  assert.equal(res.statusCode,429);assert.equal(f.queries.some(q=>q.sql.startsWith('INSERT INTO social_comments')),false);
  assert.ok(f.queries.find(q=>q.sql==='ROLLBACK'));
 }
});
test('#82 normal comment inserts once and uses SQL DB-clock spam limits',async()=>{
 const f=socialFake(),res=response();
 await loadSocialWithDb(f.db).addComment({user:{role:'customer',accountId:5},params:{id:'17'},body:{text:'Excellent work!'}},res);
 assert.equal(res.statusCode,201);assert.equal(res.body.pinned,false);
 assert.deepEqual(f.queries.find(q=>q.sql.includes('recent_total')).args,[17,5,'Excellent work!']);
 assert.equal(f.queries.filter(q=>q.sql.startsWith('INSERT INTO social_comments')).length,1);
});
test('#82 SQL schema has exactly one pin per post and bootstrap enforces it',()=>{
 const root=path.resolve(__dirname,'..');
 const migration=fs.readFileSync(path.join(root,'database/migrations/20261221_social_comment_pins.sql'),'utf8');
 const bootstrap=fs.readFileSync(path.join(root,'database/bootstrap.sql'),'utf8');
 const verify=fs.readFileSync(path.join(root,'database/bootstrap/verify.sql'),'utf8');
 assert.match(migration,/CREATE UNIQUE INDEX social_comments_one_pinned_v167_idx ON social_comments\(post_id\) WHERE pinned/);
 assert.match(migration,/CREATE INDEX social_comments_author_recent_v167_idx/);
 assert.ok(bootstrap.indexOf('20261220_barber_evidence_badges.sql')<bootstrap.indexOf('20261221_social_comment_pins.sql'));
 assert.match(verify,/20261221_social_comment_pins/);assert.match(verify,/social_comments_one_pinned_v167_idx/);
});
