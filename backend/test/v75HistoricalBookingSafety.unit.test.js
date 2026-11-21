'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {serviceIds,attachBookingServices,selectedServices,expectedPriceMatches}=require('../services/bookingSelection');
const code=readFileSync(join(__dirname,'../controllers/bookingsController.js'),'utf8');
const matches=code.match(/LEFT JOIN services ON bookings\.service_id\s*=\s*services\.id/g)||[];

test('tarixiy bron ro‘yxati xizmat katalogi o‘chirilsa ham LEFT JOIN bilan saqlanadi',()=>assert.equal(matches.length,5));
test('tarixiy bron querylari xizmat mavjud bo‘lishini shart qilmaydi',()=>assert.doesNotMatch(code,/^\s*JOIN services ON bookings\.service_id\s*=\s*services\.id/m));
test('yakka bronni ID bilan so‘rash int4 chegarasini tekshiradi',()=>assert.match(code,/id > 2147483647/));
for (const candidate of [2147483648,4294967295,Number.MAX_SAFE_INTEGER]) {
 test('postgres integer diapazonidan tashqari xizmat ID rad etiladi: '+candidate,()=>assert.throws(()=>serviceIds([candidate]),{status:400}));
}
test('int4 maksimum va tanlangan tartib saqlanadi',()=>assert.deepEqual(serviceIds([2147483647,1]),[2147483647,1]));
test('servis nomi va narxi katalogdan emas, bron snapshotidan olinadi',async()=>{
 const list=[{id:19,service_id:2,service_name:null,total_price:'75000.00',status:'completed'}];
 const database={query:async sql=>sql.includes('to_regclass')?{rows:[{ready:true}]}:{rows:[{booking_id:19,id:null,name:'Avvalgi soch xizmati',price:'75000.00',duration_minutes:30}]}};
 const value=await attachBookingServices(list,database);
 assert.equal(value[0].service_name,'Avvalgi soch xizmati');
 assert.equal(value[0].total_price,'75000.00');
 assert.equal(value[0].services[0].id,null);
 assert.equal(list[0].service_name,null);
});
test('xizmatlar ro‘yxatida bir nechta snapshotning asl tartibi saqlanadi',async()=>{
 const database={query:async sql=>sql.includes('to_regclass')?{rows:[{ready:true}]}:{rows:[
  {booking_id:7,id:5,name:'Soch',price:'30000.00',duration_minutes:30},
  {booking_id:7,id:null,name:'Soqol (arxiv)',price:'20000.00',duration_minutes:20}]}};
 const [item]=await attachBookingServices([{id:7,service_name:'Hozirgi',total_price:'50000.00'}],database);
 assert.deepEqual(item.services.map(s=>s.name),['Soch','Soqol (arxiv)']);
 assert.equal(item.service_name,'Soch');
 assert.equal(item.total_price,'50000.00');
});
test('snapshot bo‘lmagan eski bron narxi taxminan hisoblanmaydi',async()=>{
 const database={query:async sql=>sql.includes('to_regclass')?{rows:[{ready:true}]}:{rows:[]}};
 const [item]=await attachBookingServices([{id:5,service_name:'Eski',total_price:null}],database);
 assert.equal(item.total_price,null);assert.equal(item.service_name,'Eski');
});
test('katalog narxi o‘zgarsa, tasdiqlangan eski narx rad qilinadi',()=>assert.equal(expectedPriceMatches('50000.00','60000.00'),false));
test('ikki xizmatning narxi suzuvchi nuqtali xatolarsiz qo‘shiladi',async()=>{
 const rows=[{id:3,name:'A',price:'0.10',duration_minutes:10},{id:4,name:'B',price:'0.20',duration_minutes:10}];
 const result=await selectedServices({query:async()=>({rows,rowCount:2})},2,[4,3]);
 assert.equal(result.totalPrice,'0.30');
 assert.deepEqual(result.services.map(s=>s.id),[4,3]);
});
