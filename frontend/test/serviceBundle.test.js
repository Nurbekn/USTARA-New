import {test} from 'node:test';
import assert from 'node:assert/strict';
import {offerBundle} from '../src/pages/queue/serviceBundle.js';
const catalog=[
 {id:7,name:'A',price:'49999.95',duration_minutes:20},
 {id:9,name:'B',price:'10000.05',duration_minutes:10},
 {id:11,name:'C',price:'90000.00',duration_minutes:15},
];
test('v28 preview combines multiple prices without float drift',()=>{
 const quote=offerBundle(catalog,[9,7],30);
 assert.deepEqual(quote,{valid:true,duration:30,totalPrice:'60000.00',remaining:0});
});
test('v28 preview refuses incomplete and exceeding durations',()=>{
 assert.deepEqual(offerBundle(catalog,[7],30),{valid:false,duration:20,totalPrice:'49999.95',remaining:10});
 assert.deepEqual(offerBundle(catalog,[7,11],30),{valid:false,duration:35,totalPrice:'139999.95',remaining:-5});
});
test('v28 preview refuses forged, duplicate, overflow and invalid catalog values',()=>{
 for(const ids of [[7,7],[7,555],['7'],Array.from({length:21},(_,i)=>i+1)]){
  assert.equal(offerBundle(catalog,ids,30).valid,false);
 }
 assert.equal(offerBundle([{id:1,price:'NaN',duration_minutes:30}],[1],30).valid,false);
 assert.equal(offerBundle(catalog,[],30).valid,false);
});
