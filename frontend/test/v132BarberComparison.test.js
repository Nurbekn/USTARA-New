import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { comparisonRows, toggleComparedBarber, visibleCompareIds } from '../src/pages/user/explore/compareModel.js';
const services = [
  { id: 101, name: 'Soch', minPrice: 90000, maxPrice: 90000, barberIds: [1] },
  { id: 102, name: 'Soqol', minPrice: 20000, maxPrice: 20000, barberIds: [1] },
  { id: 103, name: 'Soch', minPrice: 70000, maxPrice: 90000, barberIds: [2] },
  { id: 104, name: 'Soch', barberIds: [3] },
];
const barbers = [
  {id:1, first_name:'Ali',last_name:'Olimov', address:'Chilonzor', location:{lat:41.30,lng:69.20}, rating:4.5, reviewCount:10, services:[services[0], services[1]], serviceIds:[101,102], startingPrice:20000, verification_status:'approved'},
  {id:2, first_name:'Vali', address:null, location:null, rating:null, services:[services[2]], serviceIds:[103], verification_status:'approved'},
  {id:3, first_name:'Jasur', address:'Yunusobod', services:[services[3]], serviceIds:[104], verification_status:'approved'},
  {id:4, first_name:'Hasan', address:'X', services:[], verification_status:'approved'},
];
const catalog={barbers, salons:[], services};
const origin={lat:41.30,lng:69.20};
const rows=(selection, filtered=barbers, serviceId=null, userLocation=origin) => comparisonRows(selection, filtered, catalog, serviceId, userLocation);

test('only current published search results may be compared, preserving intentional order',()=>{
  assert.deepEqual(visibleCompareIds([3,2,1],barbers),[3,2,1]);
  assert.deepEqual(visibleCompareIds([1,4,3],[barbers[0],barbers[2]]),[1,3]);
  assert.deepEqual(visibleCompareIds([2],[{id:2,verification_status:'suspended'}]),[]);
});
test('limit is 3, duplicate and unsafe IDs do not enter the comparison',()=>{
  assert.deepEqual(visibleCompareIds([1,1,2,3,4],barbers),[1,2,3]);
  assert.deepEqual(visibleCompareIds([0,-1,4.2,Number.MAX_SAFE_INTEGER+1,'1',null,1],barbers),[1]);
  for(const x of [0,1,4,1.5,null,Infinity]) assert.deepEqual(visibleCompareIds([1],barbers,x),[]);
});
test('add/remove toggle works; the fourth provider is rejected without removing selections',()=>{
  const first=toggleComparedBarber([],1,barbers);
  const full=toggleComparedBarber(toggleComparedBarber(toggleComparedBarber(first,2,barbers),3,barbers),4,barbers);
  assert.deepEqual(first,[1]); assert.deepEqual(full,[1,2,3]);
  assert.deepEqual(toggleComparedBarber(full,2,barbers),[1,3]);
  assert.deepEqual(first,[1]);
});
test('rejects absent, malicious or unpublished records instead of guessing identity',()=>{
  for(const bad of [0,999,1.2,'1',NaN,null,Number.MAX_SAFE_INTEGER])
    assert.deepEqual(toggleComparedBarber([1],bad,barbers),[1]);
  assert.deepEqual(toggleComparedBarber([],5,[...barbers,{id:5,verification_status:'rejected'}]),[]);
});
test('filters removing a candidate cannot leave its stale comparison data',()=>{
  assert.deepEqual(rows([1,2,3],[barbers[0],barbers[1]]).map(x=>x.id),[1,2]);
  assert.deepEqual(rows([1,2,3],[barbers[1]]).map(x=>x.id),[2]);
});
test('a specific service price is NOT replaced by another cheaper service or startingPrice',()=>{
  const x=rows([1],barbers,101)[0];
  assert.equal(x.priceMin,90000);
  assert.equal(x.priceMax,90000);
  assert.equal(x.bookingUrl,'/user/barbers/1?tab=services&services=101');
  assert.equal(rows([1],barbers,102)[0].priceMin,20000);
});
test('service context not offered by a barber is omitted, not compared misleadingly',()=>{
  assert.deepEqual(rows([1,2],barbers,101).map(x=>x.id),[1]);
  assert.deepEqual(rows([1],barbers,103),[]);
});
test('unknown price remains unknown while valid zero remains real',()=>{
  const unknown=rows([3])[0];
  assert.equal(unknown.priceMin,null); assert.equal(unknown.priceMax,null);
  const zeroService={id:105,name:'Bepul maslahat',minPrice:0,maxPrice:0,barberIds:[4]};
  const zbarber={...barbers[3],services:[zeroService],serviceIds:[105],startingPrice:0};
  const zcatalog={barbers:[zbarber],salons:[],services:[zeroService]};
  assert.equal(comparisonRows([4],[zbarber],zcatalog)[0].priceMin,0);
});
test('range, rating, and review count use only published server fields',()=>{
  const second=rows([2])[0];
  assert.equal(second.priceMin,70000); assert.equal(second.priceMax,90000);
  assert.equal(second.rating,null); assert.equal(second.ratingCount,null);
  const first=rows([1])[0];
  assert.equal(first.rating,4.5); assert.equal(first.ratingCount,10);
});
test('invalid rating and negative count are unknown',()=>{
  const altered={...barbers[0],rating:7,reviewCount:-1};
  const updated={...catalog,barbers:[altered]};
  const x=comparisonRows([1],[altered],updated)[0];
  assert.equal(x.rating,null); assert.equal(x.ratingCount,null);
});
test('real coordinates yield distance, missing origin/profile coordinate yields unknown',()=>{
  assert.equal(rows([1])[0].distanceKm,0);
  assert.equal(rows([2])[0].distanceKm,null);
  assert.equal(rows([1],barbers,null,null)[0].distanceKm,null);
});
test('zero services mean no booking, but public profile remains available',()=>{
  const x=rows([4])[0];
  assert.equal(x.bookingUrl,null); assert.equal(x.profileUrl,'/user/barbers/4');
});
test('no API mutation and no fabricated recommendations/scores',()=>{
  const old=barbers.map(x=>x.id);
  rows([2,1]);toggleComparedBarber([2,1],3,barbers);
  assert.deepEqual(barbers.map(x=>x.id),old);
  assert.ok(!Object.hasOwn(rows([1])[0],'winner'));
});
test('all comparison UI controls are accessible and list-only selection',async()=>{
  const explore=await readFile(new URL('../src/pages/user/Explore.jsx',import.meta.url),'utf8');
  const card=await readFile(new URL('../src/pages/user/explore/ResultCard.jsx',import.meta.url),'utf8');
  const panel=await readFile(new URL('../src/pages/user/explore/ComparisonPanel.jsx',import.meta.url),'utf8');
  assert.match(explore,/!mapShown && results\.length > 1/);
  assert.match(explore,/onToggleCompare=\{toggleCompare\}/);
  assert.match(card,/aria-pressed=\{compareSelected\}/);
  assert.match(card,/disabled=\{!compareSelected && compareFull\}/);
  assert.match(panel,/aria-labelledby="ex-compare-title"/);
  assert.match(panel,/aria-live="polite"/);
  assert.match(panel,/onRemove\(row\.id\)/);
});
test('filter changes/retry/reset clear stale comparison; map/list toggle retains it',async()=>{
  const source=await readFile(new URL('../src/pages/user/Explore.jsx',import.meta.url),'utf8');
  assert.match(source,/Object\.keys\(patch\)\.some\(key => key !== "map"\)/);
  assert.match(source,/setCompareIds\(\[\]\);\s*const next =/);
  assert.match(source,/function retry\(\) \{\s*setCompareIds\(\[\]\)/);
});
test('no localStorage write or backend mutation for comparison and mobile controls exist',async()=>{
  const model=await readFile(new URL('../src/pages/user/explore/compareModel.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../src/pages/user/Explore.css',import.meta.url),'utf8');
  assert.doesNotMatch(model,/localStorage|sessionStorage|fetch\(|request\(/);
  assert.match(css,/\.ex-compare-grid/);
  assert.match(css,/@media\(max-width:520px\)/);
});
