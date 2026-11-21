import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseChatQueryV161,chatQuickRepliesV161,chatUiV161,validateChatMessagesV161} from '../src/pages/chat/chatModelV161.js';
test('chat links accept only canonical database ids',()=>{
 assert.deepEqual(parseChatQueryV161('?barber=31&post=5&thread=14'),{barberId:31,postId:5,threadId:14});
 assert.deepEqual(parseChatQueryV161('?barber=01&post=Infinity&thread=-1'),{barberId:null,postId:null,threadId:null});
});
test('only barber sees human quick replies in three languages',()=>{
 for(const language of ['uz','ru','en']){
  assert.equal(chatQuickRepliesV161(language,'customer').length,0);
  assert.equal(chatQuickRepliesV161(language,'barber').length,3);
  assert.match(chatUiV161(language).sourceAi,/AI/i);
  assert.notEqual(chatUiV161(language).sourceHuman,chatUiV161(language).sourceAi);
 }
});
test('untrusted message records cannot invent source fields or invalid IDs',()=>{
 const base={id:2,senderUserId:11,source:'human',createdAt:new Date().toISOString(),body:'Salom'};
 assert.equal(validateChatMessagesV161({messages:[base]})[0].source,'human');
 assert.throws(()=>validateChatMessagesV161({messages:[{...base,id:NaN}]}));
 assert.throws(()=>validateChatMessagesV161({messages:[{...base,source:'magic'}]}));
 assert.throws(()=>validateChatMessagesV161({messages:[{...base,createdAt:'not-a-date'}]}));
});
