import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import {
  normalizeCatalog, selectResults, validExploreFilters, distanceKm, SORT_KEYS,
} from '../src/pages/user/explore/catalog.js';
import { canBookBarber } from '../src/pages/user/explore/homeModel.js';

const origin = { lat:41.3, lng:69.2 };
const barbers=[
  { id:1, first_name:'Uzoq', location:{lat:42, lng:70}, address:'Chilonzor',services:[] },
  { id:2, first_name:'Yaqin', location:{lat:41.31,lng:69.2}, address:'Yunusobod',services:[] },
  { id:3, first_name:'Belgilanmagan', address:'Chilonzor',services:[] },
  { id:4, first_name:'Shu yerda', location:origin, address:'Chilonzor',services:[] },
  { id:5, first_name:'Noto‘g‘ri joy', location:{lat:999,lng:0}, address:'Chilonzor',services:[] },
];
const cat=normalizeCatalog({barbers,salons:[],services:[]});
const ids=(query, location=origin)=>selectResults(cat,'barbers',new URLSearchParams(query),location).map(x=>x.id);

test('new distance sort is opt-in and does not change unfiltered server order',()=>{
  assert.equal(SORT_KEYS.includes('distance_asc'),true);
  assert.deepEqual(ids(''),[1,2,3,4,5]);
  assert.deepEqual(ids('sort=distance_asc'),[4,2,1,3,5]);
});
test('missing or invalid published coordinates stay last, preserving backend ties',()=>{
  assert.deepEqual(ids('sort=distance_asc&area=Chilonzor'),[4,1,3,5]);
  assert.equal(distanceKm(origin,barbers[2].location),Infinity);
  assert.equal(distanceKm(origin,barbers[4].location),Infinity);
});
test('nearest search refuses to guess the customer position',()=>{
  assert.deepEqual(ids('sort=distance_asc',null),[]);
  assert.deepEqual(ids('sort=distance_asc',{lat:400,lng:300}),[]);
});
test('nearest search combines with exact area filters',()=>{
  assert.deepEqual(ids('area=Yunusobod&sort=distance_asc'),[2]);
  assert.deepEqual(ids('area=Yunusobod&sort=distance_asc&q=missing'),[]);
});
test('invalid sort, map and profile URL values are flagged before search',()=>{
  for (const q of ['sort=remote','sort=DROP','map=true','map=2','type=services','type=salons','profile=-1','profile=lol','profile=9007199254740993']) {
    assert.equal(validExploreFilters(new URLSearchParams(q)),false,q);
    assert.deepEqual(ids(q),[],q);
  }
});
test('ambiguous repeated query keys cannot override or widen filters',()=>{
  for (const q of ['service=1&service=2','q=Chilonzor&q=Yunusobod','sort=price_asc&sort=name','map=1&map=0','min=100&min=0','type=barbers&type=services','area=Yunusobod&area=Chilonzor','profile=1&profile=2']) {
    assert.equal(validExploreFilters(new URLSearchParams(q)),false,q);
    assert.deepEqual(ids(q),[],q);
  }
});
test('known bookmarked URLs and existing filters remain accepted',()=>{
  for (const q of ['','type=barbers&sort=price_asc','q=Chilonzor&sort=distance_asc','area=Yunusobod&map=1','sort=relevance','profile=3','min=0&max=100000'])
    assert.equal(validExploreFilters(new URLSearchParams(q)),true,q);
});
test('excessively long region and category are invalid',()=>{
  for (const key of ['region','category'])
    assert.equal(validExploreFilters(new URLSearchParams([[key,'x'.repeat(161)]])),false);
});
test('public booking action requires an actual published positive service ID',()=>{
  assert.equal(canBookBarber(null),false);
  assert.equal(canBookBarber({services:[]}),false);
  assert.equal(canBookBarber({services:[{}]}),false);
  assert.equal(canBookBarber({services:[{id:0}]}),false);
  assert.equal(canBookBarber({services:[{id:31}]}),true);
});
test('nearby sort, location notice and no-service booking CTA are wired into pages',async()=>{
  const explore=await readFile(new URL('../src/pages/user/Explore.jsx',import.meta.url),'utf8');
  const card=await readFile(new URL('../src/pages/user/explore/ResultCard.jsx',import.meta.url),'utf8');
  const home=await readFile(new URL('../src/pages/user/UserHome.jsx',import.meta.url),'utf8');
  assert.match(explore,/option value="distance_asc" disabled=\{!hasLocation\}/);
  assert.match(explore,/const needsLocation = params.get\("sort"\) === "distance_asc"/);
  assert.match(explore,/needsLocation && !hasLocation/);
  assert.match(explore,/userLocation=\{profile.location\}/);
  assert.match(card,/validPoint\(userLocation\) && validPoint\(item.location\)/);
  assert.match(card,/ui\.cardDistance/);
  const {customerCoreUi}=await import('../src/pages/user/coreLocale.js');
  assert.equal(customerCoreUi('uz').explore.cardDistance,'to‘g‘ri chiziqda');
  assert.match(home,/canBookBarber\(barber\)/);
  assert.match(home,/ui\.unavailable/);
  const {customerCoreUi: homeCopy}=await import('../src/pages/user/coreLocale.js');
  assert.equal(homeCopy('uz').home.unavailable,'Xizmatlar hozircha yo‘q');
  assert.match(home,/id="uh-search-input" type="search" maxLength=\{160\}/);
});

// Load original public API adapter with fetch mocked and no npm dependencies.
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const urlFor=code=>`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
async function loadModule(url){
 let source=(await readFile(url,'utf8')).replaceAll('import.meta.env','{"DEV":true}');
 for(const match of [...source.matchAll(/(from\s+|import\()["']([^"']+)["']/g)]) {
   const dependency=await loadModule(new URL(match[2],url));
   source=source.replace(match[0],`${match[1]}"${dependency}"`);
 }
 return urlFor(source);
}
const {loadExploreCatalog}=await import(await loadModule(new URL('../src/pages/user/explore/catalog.js',import.meta.url)));
test('rejects duplicate approved provider IDs from API, no ambiguous profile links',async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify([
    {id:10,first_name:'Ali',last_name:null,services:[]},{id:10,first_name:'Vali',last_name:null,services:[]}
  ]));
  await assert.rejects(loadExploreCatalog(),/sartaroshlar ro‘yxati/);
});
test('rejects invalid provider ID but accepts distinct approved rows',async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify([{id:2147483648,first_name:null,last_name:null,services:[]}]));
  await assert.rejects(loadExploreCatalog(),/sartaroshlar ro‘yxati/);
  globalThis.fetch=async()=>new Response(JSON.stringify([{id:10,first_name:null,last_name:null,services:[]},{id:11,first_name:null,last_name:null,services:[]}]));
  assert.deepEqual((await loadExploreCatalog()).barbers.map(x=>x.id),[10,11]);
});
