'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const {createHandlers,id,bodyText}=require('../services/customerBarberChat');
const rows=values=>({rows:values,rowCount:values.length});
const customer={role:'customer',accountId:11},barber={role:'barber',accountId:20};
function response(){return {statusCode:200,body:null,headers:{},status(n){this.statusCode=n;return this;},json(value){this.body=value;return this;},set(k,v){this.headers[k]=v;return this;}};}
function fake({allowed=true,approved=true,postAllowed=true,recent=false,failed=false}={}){
 const calls=[];
 const query=async(sql,args=[])=>{
  calls.push({sql,args});if(failed)throw Error('test DB unavailable');
  if(sql.includes('INSERT INTO customer_barber_chat_threads'))return rows([{id:3}]);
  if(sql.includes('FROM customer_barber_chat_threads t JOIN barbers b')){
   if(sql.includes('t.id=$1'))return rows(allowed?[{id:3,customer_user_id:11,barber_user_id:20,verification_status:approved?'approved':'rejected'}]:[]);
   return rows([{id:3,barber_id:7,peer_name:'Qodir Ali',updated_at:new Date()}]);
  }
  if(sql.includes('SELECT 1 FROM social_posts'))return rows(postAllowed?[{ok:1}]:[]);
  if(sql.includes('SELECT created_at FROM customer_barber_chat_messages'))return rows(recent?[{created_at:new Date()}]:[]);
  if(sql.includes('INSERT INTO customer_barber_chat_messages'))return rows([{id:5,thread_id:3,sender_user_id:args[1],body:args[2],shared_post_id:args[3],sender_kind:'human',created_at:new Date()}]);
  if(sql.includes('SELECT m.id,m.thread_id'))return rows([{id:5,thread_id:3,sender_user_id:11,body:'Salom',shared_post_id:null,sender_kind:'human',created_at:new Date()}]);
  return rows([]);
 };
 return {db:{query,connect:async()=>({query,release(){calls.push({sql:'RELEASE'});}})},calls};
}
test('strict account/profile identifiers and bounded message text',()=>{
 for(const value of ['-1','01','2x','2147483648',false,undefined,{},0])assert.equal(id(value),null);
 assert.equal(id('21'),21);assert.equal(bodyText(' ok '),'ok');assert.equal(bodyText(''), '');
 assert.equal(bodyText('x'.repeat(1001)),null);assert.equal(bodyText('zero\u0000byte'),null);
});
test('only customer may start a conversation with approved barber; no target guessing',async()=>{
 const f=fake(),handlers=createHandlers(f.db);
 const denied=response();await handlers.createThread({user:barber,body:{barberId:7}},denied);
 assert.equal(denied.statusCode,403);assert.equal(f.calls.length,0);
 const bad=response();await handlers.createThread({user:customer,body:{barberId:'01'}},bad);assert.equal(bad.statusCode,400);
 const ok=response();await handlers.createThread({user:customer,body:{barberId:7}},ok);
 assert.deepEqual(ok.body,{threadId:3});assert.deepEqual(f.calls.find(x=>x.sql.includes('INSERT INTO customer_barber_chat_threads')).args,[11,7]);
 assert.match(f.calls.find(x=>x.sql.includes('INSERT INTO customer_barber_chat_threads')).sql,/verification_status='approved'/);
});
test('message reads require role and verified thread membership; sender user id not selectable',async()=>{
 const f=fake({allowed:false}),h=createHandlers(f.db);const denied=response();
 await h.read({user:customer,params:{threadId:'3'}},denied);
 assert.equal(denied.statusCode,404);assert.ok(!f.calls.some(x=>x.sql.includes('SELECT m.id')));
 const x=fake(),h2=createHandlers(x.db),res=response();await h2.read({user:barber,params:{threadId:'3'}},res);
 assert.equal(res.statusCode,200);assert.equal(res.body.messages[0].senderUserId,11);
 assert.ok(x.calls.some(call=>call.sql.includes('b.user_id=$3')));
});
test('sender role cannot set AI provenance, and another user cannot write',async()=>{
 const f=fake(),h=createHandlers(f.db);
 for(const forged of [{body:'hi',source:'ai'},{body:'hi',senderKind:'ai'},{body:'hi',isAi:true},{body:'\u0000x'},{body:''}]){
  const res=response();await h.send({user:customer,params:{threadId:'3'},body:forged},res);assert.equal(res.statusCode,400);
 }
 assert.equal(f.calls.length,0);
 const unauthorized=fake({allowed:false}),r=response();await createHandlers(unauthorized.db).send({user:customer,params:{threadId:'3'},body:{body:'salom'}},r);
 assert.equal(r.statusCode,404);assert.ok(!unauthorized.calls.some(x=>x.sql.includes('INSERT INTO customer_barber_chat_messages')));
 assert.ok(unauthorized.calls.some(x=>x.sql==='ROLLBACK'));
});
test('authorized send locks thread, writes human-only message and commits',async()=>{
 const f=fake(),r=response();await createHandlers(f.db).send({user:customer,params:{threadId:'3'},body:{body:'salom'}},r);
 assert.equal(r.statusCode,201);assert.equal(r.body.message.source,'human');
 const member=f.calls.find(x=>x.sql.includes('FOR UPDATE OF t'));assert.ok(member);assert.deepEqual(member.args,[3,'customer',11]);
 const write=f.calls.find(x=>x.sql.includes('INSERT INTO customer_barber_chat_messages'));assert.ok(write.sql.includes("'human'"));assert.deepEqual(write.args,[3,11,'salom',null]);
 assert.equal(f.calls.filter(x=>x.sql==='COMMIT').length,1);
 assert.ok(f.calls.some(x=>x.sql==='RELEASE'));
});
test('post shares require public approved posts; rate limit serializes per thread',async()=>{
 for(const [opts,expected] of [[{postAllowed:false},404],[{approved:false},409],[{recent:true},429]]){
  const f=fake(opts),res=response();await createHandlers(f.db).send({user:customer,params:{threadId:'3'},body:{sharedPostId:8}},res);
  assert.equal(res.statusCode,expected);assert.ok(!f.calls.some(x=>x.sql.includes('INSERT INTO customer_barber_chat_messages')));
  assert.ok(f.calls.some(x=>x.sql==='ROLLBACK'));
 }
 const f=fake(),r=response();await createHandlers(f.db).send({user:barber,params:{threadId:'3'},body:{body:'',sharedPostId:8}},r);
 assert.equal(r.statusCode,201);assert.equal(r.body.message.sharedPostId,8);
 assert.equal(r.body.message.body,'Ulashilgan post');
});
test('unavailable database does not silently claim a sent message',async()=>{
 const f=fake({failed:true}),r=response();await createHandlers(f.db).send({user:customer,params:{threadId:'3'},body:{body:'hello'}},r);
 assert.equal(r.statusCode,503);assert.equal(r.body.code,'chat_unavailable');
 assert.ok(f.calls.some(x=>x.sql==='RELEASE'));
});
