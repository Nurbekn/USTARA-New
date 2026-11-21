import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyQueue} from '../src/pages/barber/data/queueModel.js';

test('todays waiting queue is FIFO and prior-day entries never block a new call',()=>{
  const entries=[
    {id:'100',queue_date:'2026-11-17',status:'called'},
    {id:'101',queue_date:'2026-11-17',status:'waiting'},
    {id:'102',queue_date:'2026-11-18',status:'waiting'},
    {id:'103',queue_date:'2026-11-18',status:'waiting'},
  ];
  const result=classifyQueue(entries,'2026-11-18');
  assert.equal(result.called,null);
  assert.deepEqual(result.waiting.map(row=>row.id),['102','103']);
  assert.deepEqual(result.oldActive.map(row=>row.id),['100','101']);
  assert.deepEqual(entries[0],{id:'100',queue_date:'2026-11-17',status:'called'});
});
test('active called entry is isolated from waiting and ready to finish',()=>{
  const r=classifyQueue([{id:1,queue_date:'2026-11-18',status:'called'},
    {id:2,queue_date:'2026-11-18',status:'waiting'}],'2026-11-18');
  assert.equal(r.called.id,1);assert.deepEqual(r.waiting.map(e=>e.id),[2]);
});
test('no queue entries can be shown to a new barber state',()=>{
  assert.deepEqual(classifyQueue([],'2026-11-18'),{called:null,waiting:[],oldActive:[]});
});
