import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import {
  normalizeCatalog, selectResults, listingPrice, bookingProfileQuery,
  validExploreFilters,
} from '../src/pages/user/explore/catalog.js';

const barbers = [
  { id: 41, first_name: 'Jamshid', last_name: 'Aliyev', address: 'Yunusobod tumani',
    startingPrice: 10000, serviceIds:[101,102], services:[
      { id:101, name:'Soch', minPrice:10000,maxPrice:10000, barberIds:[41] },
      { id:102, name:'Ranglash', minPrice:90000,maxPrice:90000, barberIds:[41] },
    ] },
  { id: 42, first_name:'Dilshod', last_name:'Karimov',address:'Yunusobod tumani',
    startingPrice:20000, serviceIds:[103,104], services:[
      { id:103, name:'Soch',minPrice:20000,maxPrice:20000,barberIds:[42] },
      { id:104, name:'Ranglash',minPrice:50000,maxPrice:50000,barberIds:[42] },
    ] },
  { id:43, first_name:'Akmal', last_name:'Olimov', address:null, startingPrice:1000,
    serviceIds:[105], services:[{id:105,name:'Soch',minPrice:1000,maxPrice:1000,barberIds:[43]}] },
];
const catalog=normalizeCatalog({barbers,salons:[],services:barbers.flatMap(x=>x.services)});
const ids=q=>selectResults(catalog,'barbers',new URLSearchParams(q),null).map(x=>x.id);

test('price sort without service filter still uses the published starting price',()=>{
  assert.deepEqual(ids('sort=price_asc'),[43,41,42]);
});
test('selected service determines price sorting, not unrelated cheap cuts',()=>{
  const copy=normalizeCatalog({barbers:[...barbers],salons:[],services:[...catalog.services]});
  // Two different providers offer the same named service, but with distinct IDs.
  assert.deepEqual(selectResults(copy,'barbers',new URLSearchParams('service=102&sort=price_asc'),null).map(x=>x.id),[41]);
  // Sorting helper must use the selected service price when card may show multiple services.
  assert.deepEqual(listingPrice(barbers[0],'barbers',copy,'102'),{min:90000,max:90000});
  assert.deepEqual(listingPrice(barbers[1],'barbers',copy,'104'),{min:50000,max:50000});
  assert.deepEqual(listingPrice(barbers[0],'barbers',copy,null),{min:10000,max:90000});
});
test('selected-service price filters exclude an unrelated cheap service',()=>{
  assert.deepEqual(ids('service=102&min=60000&max=100000'),[41]);
  assert.deepEqual(ids('service=102&max=30000'),[]);
  assert.deepEqual(ids('service=104&max=60000'),[42]);
});
test('unselected result price range still matches any overlapping available service',()=>{
  assert.deepEqual(ids('max=15000'),[41,43]);
});
test('service without a published price stays unknown; missing price is not zero',()=>{
  const missing={id:50,first_name:'No',last_name:'Price',services:[{id:501,name:'Test',barberIds:[50]}],serviceIds:[501],startingPrice:2000};
  const another=normalizeCatalog({barbers:[missing],salons:[],services:[...missing.services]});
  assert.deepEqual(listingPrice(missing,'barbers',another,'501'),{min:null,max:null});
  assert.deepEqual(selectResults(another,'barbers',new URLSearchParams('service=501&min=0'),null),[]);
});
test('booking link preselects only a provider-owned service',()=>{
  assert.equal(bookingProfileQuery('102',barbers[0].services),'tab=services&services=102');
  assert.equal(bookingProfileQuery('104',barbers[0].services),'tab=services');
  assert.equal(bookingProfileQuery('102%2C104',barbers[0].services),'tab=services');
  assert.equal(bookingProfileQuery(null,barbers[0].services),'tab=services');
  assert.equal(bookingProfileQuery('102',[]),'tab=services');
});
test('unknown URL numeric filters do not broaden a filtered search',()=>{
  for(const q of ['rating=NaN','rating=-3','rating=6','distance=Infinity','distance=-1','distance=20001','available=2','service=xyz','service=0','service=9007199254740999',`q=${'a'.repeat(161)}`,`area=${'b'.repeat(161)}`]) {
    assert.equal(validExploreFilters(new URLSearchParams(q)),false,q);
    assert.deepEqual(ids(q),[],q);
  }
});
test('valid search and price filters retain the prior behavior',()=>{
  for(const q of ['','q=Jamshid','rating=4.5','distance=3','available=1','area=yunusobod','service=102','min=0&max=100000'])
    assert.equal(validExploreFilters(new URLSearchParams(q)),true,q);
  assert.deepEqual(ids('q=jamshid&area=Yunusobod'),[41]);
});
test('incoming q input and invalid URL state have visible UI safeguards',async()=>{
  const source=await readFile(new URL('../src/pages/user/Explore.jsx',import.meta.url),'utf8');
  assert.match(source,/value=\{query\}\s+maxLength=\{160\}/);
  assert.match(source,/const badFilters = !validExploreFilters\(params\)/);
  assert.match(source,/ui\.badFilters/);
  const {customerCoreUi}=await import('../src/pages/user/coreLocale.js');
  assert.match(customerCoreUi('uz').explore.badFilters,/Qidiruv URL manzili yoki filtr qiymati noto‘g‘ri/);
});
test('search cards use selected service price and preserve it during direct booking',async()=>{
  const source=await readFile(new URL('../src/pages/user/explore/ResultCard.jsx',import.meta.url),'utf8');
  assert.match(source,/listingPrice\(item, type, catalog, selectedServiceId\)/);
  assert.match(source,/bookingProfileQuery\(selectedServiceId, services\)/);
});
test('map distinguishes coordinate-ready results from total matching profiles',async()=>{
  const source=await readFile(new URL('../src/pages/user/BarbersMap.jsx',import.meta.url),'utf8');
  assert.match(source,/\{mapped\.length\} \/ \{barbers\.length\}/);
  assert.match(source,/barbers\.length - mapped\.length/);
  assert.match(source,/if \(!mapped\.length\)/);
});

// Independent fetch-backed validation tests: the test never contacts the real API.
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const moduleUrl=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
async function loadModule(url){
 let source=(await readFile(url,'utf8')).replaceAll('import.meta.env','{"DEV":true}');
 for(const match of source.matchAll(/(from\s+|import\()["']([^"']+)["']/g)){
   const dep=await loadModule(new URL(match[2],url));
   source=source.replace(match[0],`${match[1]}"${dep}"`);
 }
 return moduleUrl(source);
}
const {loadExploreCatalog}=await import(await loadModule(new URL('../src/pages/user/explore/catalog.js',import.meta.url)));
const responseFor=items=>async()=>new Response(JSON.stringify(items));
test('normal approved provider with service and price remains loadable',async()=>{
  globalThis.fetch=responseFor([barbers[0]]);
  const data=await loadExploreCatalog();
  assert.equal(data.services.length,2);
  assert.equal(data.barbers[0].id,41);
});
test('rejects malformed published service prices instead of showing bogus offers',async()=>{
  for(const bad of [-3,'10000',{ invalid:true }]){
    const row={...barbers[0],services:[{...barbers[0].services[0],minPrice:bad},barbers[0].services[1]]};
    globalThis.fetch=responseFor([row]);
    await assert.rejects(loadExploreCatalog(),/narxlari|xizmatlar/);
  }
});
test('rejects duplicated or cross-linked services rather than associating wrong barbers',async()=>{
  const invalid=[
    [{...barbers[0],services:[barbers[0].services[0],barbers[0].services[0]]}],
    [{...barbers[0],services:[{...barbers[0].services[0],barberIds:[42]},barbers[0].services[1]]}],
    [{...barbers[0],serviceIds:[101,999]}],
    [barbers[0], {...barbers[1], services:[{...barbers[1].services[0],id:101},barbers[1].services[1]],serviceIds:[101,104]}],
  ];
  for(const rows of invalid){
    globalThis.fetch=responseFor(rows);
    await assert.rejects(loadExploreCatalog(),/xizmatlar ro‘yxati/);
  }
});
test('API HTTP error stays a failure rather than an empty successful directory',async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify({message:'API failed'}),{status:503});
  await assert.rejects(loadExploreCatalog(),{status:503});
});
