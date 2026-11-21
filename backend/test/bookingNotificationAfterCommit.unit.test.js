'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {notifyAfterCommit}=require('../services/bookingNotificationAfterCommit');
test('success sends once',async()=>{
  const calls=[];
  assert.equal(await notifyAfterCommit(async(...args)=>calls.push(args),42,'confirmed'),true);
  assert.deepEqual(calls,[[42,'confirmed']]);
});
test('failed Telegram transport does not invalidate a committed booking or expose secrets',async()=>{
  const prior=console.error;const logged=[];console.error=(...args)=>logged.push(args.join(' '));
  try{
    assert.equal(await notifyAfterCommit(async()=>{throw Error('private-bot-token');},42,'confirmed'),false);
    assert.ok(logged.length);
    assert.equal(logged.some(line=>line.includes('private-bot-token')),false);
  }finally{console.error=prior;}
});
