import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseBarberQueueSnapshot} from '../src/pages/barber/data/barberQueueReadGuardV93.js';
import {createLatestRequestGate} from '../src/pages/queue/requestOrderV42.js';
const when='2026-11-19T12:00:00.000Z';
const base={id:'15',display_label:'Mehmon',queue_date:'2026-11-19',status:'waiting',queue_position:1,
  created_at:when,called_at:null,finished_at:null,is_qr:false,manual_linked:false};
const qr={pending:[{id:'9',display_label:'QR mehmon',created_at:when}]};
const offers={openings:[{id:'5',state:'offered',start_at:when,duration_minutes:30,
  display_label:'Mehmon',expires_at:when,booking_id:3,telegram_notice_status:'pending'}]};
const queue={active:[base],recent:[]};
const parse=(q=queue,r=qr,o=offers)=>parseBarberQueueSnapshot(q,r,o);
test('v93 valid barber snapshot normalizes PG BIGINT string IDs',()=>{
 const got=parse();assert.equal(got.active[0].id,15);
 assert.equal(got.pending[0].id,9);assert.equal(got.openings[0].id,5);
 assert.equal(got.openings[0].booking_id,3);
});
test('v93 empty valid snapshot gives four empty arrays',()=>{
 assert.deepEqual(parse({active:[],recent:[]},{pending:[]},{openings:[]}),
  {active:[],recent:[],pending:[],openings:[]});
});
test('v93 all returned objects use explicit allowlists to strip private data',()=>{
 const got=parse({active:[{...base,phone:'+998000000000',private_note:'SECRET'}],recent:[]},
  {pending:[{...qr.pending[0],secret:'SECRET'}]},
  {openings:[{...offers.openings[0],user_token:'SECRET'}]});
 assert.equal(JSON.stringify(got).includes('SECRET'),false);
 assert.equal(JSON.stringify(got).includes('phone'),false);
});
for(const value of [null,{},[],{active:null,recent:[]},{active:[],recent:null},
 {active:Array(101).fill(base),recent:[]},{active:[],recent:Array(21).fill(base)}]){
 test('v93 rejects invalid queue container '+String(value),()=>assert.equal(parse(value),null));
}
for(const delta of [{id:0},{id:'0'},{id:'01'},{id:'1e2'},{id:'0x10'},
 {id:'9007199254740992'},{id:-2},{id:2.5},
 {queue_date:'2026-02-30'},{queue_date:'2026-99-01'},
 {status:'served'},{status:'unrecognized'},{queue_position:-1},
 {created_at:'not-a-date'},{display_label:''},{display_label:'X'.repeat(61)},
 {display_label:'abc\u0000'},{is_qr:'false'},{manual_linked:1}]){
 test('v93 rejects malformed waiting entry '+JSON.stringify(delta),()=>{
  assert.equal(parse({active:[{...base,...delta}],recent:[]}),null);
 });
}
test('v93 terminal entry can only be in recent list',()=>{
 assert.equal(parse({active:[],recent:[{...base,id:'20',status:'served'}]}).recent[0].status,'served');
 assert.equal(parse({active:[],recent:[{...base,status:'waiting'}]}),null);
});
test('v93 rejects duplicate entry IDs even across active and recent',()=>{
 assert.equal(parse({active:[base],recent:[{...base,id:15,status:'served'}]}),null);
});
test('v93 rejects duplicate QR IDs as string and number',()=>{
 assert.equal(parse(queue,{pending:[qr.pending[0],{...qr.pending[0],id:9}]}),null);
});
test('v93 rejects duplicate offer IDs',()=>{
 assert.equal(parse(queue,qr,{openings:[offers.openings[0],{...offers.openings[0],id:5}]}),null);
});
for(const delta of [{id:'1e3'},{id:'9007199254740993'},{duration_minutes:0},{duration_minutes:1441},
 {start_at:'invalid'},{state:'fake'},{booking_id:-1},{telegram_notice_status:'delivered'}]){
 test('v93 rejects malformed smart opening '+JSON.stringify(delta),()=>{
  assert.equal(parse(queue,qr,{openings:[{...offers.openings[0],...delta}]}),null);
 });
}
for(const bad of [null,{},[],{pending:null},{pending:Array(26).fill(qr.pending[0])}]){
 test('v93 rejects unsafe QR pending list '+String(bad),()=>assert.equal(parse(queue,bad),null));
}
test('v93 old request cannot overwrite newer barber queue data',()=>{
 const gate=createLatestRequestGate();
 const first=gate.next(),second=gate.next();
 assert.equal(gate.isLatest(first),false);
 assert.equal(gate.isLatest(second),true);
 gate.invalidate();assert.equal(gate.isLatest(second),false);
});
test('v93 barber queue UI fails closed and preserves manual refresh',()=>{
 const src=readFileSync(new URL('../src/pages/barber/Queue.jsx',import.meta.url),'utf8');
 assert.match(src,/subscribeSession/);
 assert.match(src,/sameBarber\(token\)&&readGate\.current\.isLatest\(requestId\)/);
 assert.match(src,/clearQueue\(\);setError\(tr\('Navbat ma’lumotini yangilab bo‘lmadi/);
 assert.match(src,/readyRef\.current=false/);
 assert.match(src,/!readyRef\.current\|\|actionLock\.current/);
 assert.match(src,/disabled=\{busy\|\|loading\|\|readFailed\|\|!!called/);
 assert.match(src,/disabled=\{busy\|\|loading\} onClick/);
 assert.match(src,/Amal natijasi noaniq/);
});
