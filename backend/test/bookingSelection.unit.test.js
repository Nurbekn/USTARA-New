const { test } = require('node:test');
const assert = require('node:assert/strict');
const { serviceIds, selectedServices, BookingSelectionError } = require('../services/bookingSelection');
test('xizmatlar tanlovi bo‘sh, takroriy, noto‘g‘ri yoki haddan ko‘p bo‘lmaydi', () => {
 for (const value of [null,[],[1,1],['1'],[0],[-1],[1.5],Array.from({length:21},(_,i)=>i+1)]) assert.throws(()=>serviceIds(value),error=>error instanceof BookingSelectionError&&error.status===400);
 assert.deepEqual(serviceIds([2,1]),[2,1]);
});
test('narx tiyinlarda yig‘iladi va xizmat tanlash tartibi saqlanadi', async () => {
 const rows=[{id:1,name:'Soch',price:'1000.10',duration_minutes:20},{id:2,name:'Soqol',price:'2000.20',duration_minutes:10}];
 const result=await selectedServices({query:async()=>({rows,rowCount:rows.length})},5,[2,1]);
 assert.equal(result.totalPrice,'3000.30');assert.equal(result.duration,30);assert.deepEqual(result.services.map(s=>s.id),[2,1]);
});
test('topilmagan tanlov qisman bron qilinmaydi', async () => {
 await assert.rejects(selectedServices({query:async()=>({rows:[],rowCount:0})},5,[1,2]),{status:400,code:'service_unavailable'});
});
test('buzilgan davomiylik yoki narxdan bron hisoblanmaydi', async () => {
 for(const row of [{id:1,price:'x',duration_minutes:20},{id:1,price:'1000',duration_minutes:0},{id:1,price:'1000',duration_minutes:12}])await assert.rejects(selectedServices({query:async()=>({rows:[row],rowCount:1})},5,[1]),{status:503});
});
