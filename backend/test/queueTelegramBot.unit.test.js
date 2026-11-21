'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createUpdateHandler}=require('../telegram/handler');
const INV='a'.repeat(48);
function harness(){
 const calls=[],sent=[];
 const queueNotify={async consume(token,chat){calls.push(['consume',token,chat]);},async stopChat(chat){calls.push(['stop',chat]);}};
 const handler=createUpdateHandler({username:'ustara_test_bot',service:{},queueNotify,
  api:async(method,body)=>{sent.push({method,body});}});
 const send=(text,chat={type:'private',id:42},from=42)=>handler({message:{text,chat,from:{id:from,is_bot:false}}});
 return {calls,sent,send};
}
test('only a matching private sender can opt in from a one-use Telegram deep link',async()=>{
 const h=harness();await h.send('/start qnotify_'+INV);
 assert.deepEqual(h.calls,[['consume',INV,42]]);
 assert.match(h.sent[0].body.text,/yoqildi/);assert.equal(h.sent[0].body.protect_content,true);
 const group=harness();await group.send('/start qnotify_'+INV,{type:'group',id:-100},42);
 await group.send('/start qnotify_'+INV,{type:'private',id:42},78);
 assert.equal(group.calls.length,0);assert.equal(group.sent.length,0);
});
test('stopqueue in private chat revokes all that chat\'s queue subscriptions',async()=>{
 const h=harness();await h.send('/stopqueue');
 assert.deepEqual(h.calls,[['stop',42]]);assert.match(h.sent[0].body.text,/to‘xtatildi/);
});
test('expired/ineligible queue invite only yields generic non-secret denial',async()=>{
 const sent=[];
 const handler=createUpdateHandler({username:'ustara_test_bot',service:{},
  queueNotify:{async consume(){throw Object.assign(Error('Havola muddati tugagan'),{status:410});}},
  api:async(method,body)=>sent.push(body)});
 await handler({message:{text:'/start qnotify_'+INV,chat:{type:'private',id:42},from:{id:42,is_bot:false}}});
 assert.equal(sent[0].text,'Havola muddati tugagan');assert.ok(sent[0].protect_content);
});
