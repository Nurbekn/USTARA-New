import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Buffer} from 'node:buffer';
const url=src=>`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`;
async function moduleAt(file){
 let body=(await readFile(file,'utf8')).replaceAll('import.meta.env','{"DEV":true}');
 for(const match of body.matchAll(/from "([^"]+)"/g))
  body=body.replace(match[0],`from "${await moduleAt(new URL(match[1],file))}"`);
 return url(body);
}
const {loadAvailableSlots}=await import(await moduleAt(new URL('../src/pages/user/barber/availableSlots.js',import.meta.url)));
const original=globalThis.fetch;
afterEach(()=>{globalThis.fetch=original;});
const params={barberId:7,serviceIds:[12],date:'2030-01-07'};
const data={date:params.date,working:true,duration:15,total_price:'45000.00',service_ids:[12],
 slots:[{start:'09:40',end:'09:55'}],
 candidates:[{start:'09:10',end:'09:25',available:false},{start:'09:40',end:'09:55',available:true}],
 busy:[{start:'09:20',end:'09:40',customer_name:'Private'}]};
function reply(payload){globalThis.fetch=async()=>new Response(JSON.stringify(payload));}
test('legacy API cannot leak occupied times or customer names through booking picker',async()=>{
 reply(data); const result=await loadAvailableSlots(params);
 assert.deepEqual(result.slots,[{time:'09:40',endTime:'09:55',available:true,reason:'Bo‘sh'}]);
 assert.equal(Object.hasOwn(result,'busy'),false);
 assert.equal(Object.hasOwn(result,'candidates'),false);
 assert.doesNotMatch(JSON.stringify(result),/Private|09:20|09:10/);
});
test('new public response with only free slots is accepted',async()=>{
 reply({...data,candidates:[{start:'09:40',end:'09:55',available:true}],busy:undefined});
 const result=await loadAvailableSlots(params);
 assert.deepEqual(result.slots.map(s=>s.time),['09:40']);
});
test('empty working day stays empty and does not invent booked time',async()=>{
 reply({...data,slots:[],candidates:[],busy:[{start:'09:00',end:'10:00'}]});
 const result=await loadAvailableSlots(params);
 assert.deepEqual(result.slots,[]);
 assert.equal(Object.hasOwn(result,'busy'),false);
});
test('contradictory server free/busy information is rejected, not made clickable',async()=>{
 reply({...data,candidates:[{start:'09:40',end:'09:55',available:false}]});
 await assert.rejects(loadAvailableSlots(params),/Vaqtlar noto‘g‘ri qaytdi/);
});
