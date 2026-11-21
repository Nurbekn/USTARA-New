import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeCatalog, selectResults, searchScore, validPriceRange, SORT_KEYS } from '../src/pages/user/explore/catalog.js';
import { siteLocaleSwitchUrl } from '../src/utils/siteLocale.js';

const barbers = [
  { id: 21, first_name: 'Ali', last_name: 'Olimov', specialty: 'Fade ustasi', address: 'Toshkent, Chilonzor tumani', startingPrice: 50000, serviceIds: [201], services: [{id:201, name:'Soch olish', minPrice:50000, maxPrice:50000, barberIds:[21]}] },
  { id: 22, first_name: 'Dilshod', last_name: 'Aliyev', specialty: 'Rang berish', address: 'Toshkent, Yunusobod tumani', startingPrice: 30000, serviceIds: [202], services: [{id:202, name:'Fade', minPrice:30000, maxPrice:30000, barberIds:[22]}] },
  { id: 23, first_name: 'Chilonzor', last_name: 'Karimov', specialty: 'Usta', address: null, serviceIds: [], services: [] },
  { id: 24, first_name: 'Jasur', last_name: 'Bekov', specialty: 'Usta', address: 'Chilonzor, Toshkent', startingPrice: 0, serviceIds: [], services: [] },
  { id: 25, first_name: 'Bobur', last_name: 'Qodirov', specialty: 'Usta', address: 'Chilonzor, Toshkent', startingPrice: 30000, serviceIds: [], services: [] },
];
const catalog = normalizeCatalog({barbers, salons:[], services:barbers.flatMap(b=>b.services)});
function ids(query) {return selectResults(catalog,'barbers',new URLSearchParams(query),null).map(item=>item.id);}

test('default browsing keeps server order, including missing prices',()=>{
  assert.deepEqual(ids(''),[21,22,23,24,25]);
  assert.deepEqual(ids('sort=relevance'),[21,22,23,24,25]);
});
test('explicit ascending prices put exact zero and low prices first, unknown at end',()=>{
  assert.deepEqual(ids('sort=price_asc'),[24,22,25,21,23]);
});
test('explicit descending prices leave unknown last and preserve price ties',()=>{
  assert.deepEqual(ids('sort=price_desc'),[21,22,25,24,23]);
});
test('name sort is alphabetical using published profile name',()=>{
  const actual=ids('sort=name');
  const expected=[...barbers].sort((a,b)=>`${a.first_name} ${a.last_name}`.toLocaleLowerCase('uz').localeCompare(`${b.first_name} ${b.last_name}`.toLocaleLowerCase('uz'),'uz')).map(x=>x.id);
  assert.deepEqual(actual,expected);
});
test('unrecognized sorts fail closed instead of broadening a bookmarked search',()=>{
  assert.deepEqual(ids('sort=drop_tables'),[]);
  assert.deepEqual(SORT_KEYS,['relevance','price_asc','price_desc','name','distance_asc']);
});
test('matching name ranks ahead of specialty, service and district when filtering q',()=>{
  assert.deepEqual(ids('q=chilonzor'),[23,21,24,25]);
  assert.deepEqual(ids('q=fade'),[21,22]);
  assert.ok(searchScore(barbers[2],'barbers',[],'chilonzor') > searchScore(barbers[0],'barbers',barbers[0].services,'chilonzor'));
});
test('relevance scores do not fabricate ratings or free availability',()=>{
  assert.deepEqual(ids('q=chilonzor&available=1'),[]);
  assert.deepEqual(ids('q=chilonzor&rating=4'),[]);
});
test('area filters and price sort intersect; name without address does not match location filter',()=>{
  assert.deepEqual(ids('area=chilonzor&sort=price_asc'),[24,25,21]);
  assert.deepEqual(ids('area=yunusobod&sort=price_desc'),[22]);
});
test('multi-term case-insensitive q keeps only records containing all terms',()=>{
  assert.deepEqual(ids('q=chilonzor+ali'),[21]);
  assert.deepEqual(ids('q=YUNUSOBOD+FADE'),[22]);
  assert.deepEqual(ids('q=yunusobod+jasur'),[]);
});
test('sort never mutates original catalog order or embedded service lists',()=>{
  const before=catalog.barbers.map(item=>item.id);
  ids('sort=price_desc');ids('q=fade');ids('sort=name');
  assert.deepEqual(catalog.barbers.map(item=>item.id),before);
  assert.deepEqual(catalog.barbers[0].services.map(s=>s.id),[201]);
});
test('valid price values include zero; invalid negatives, infinity, NaN, reversed and exponential text are rejected',()=>{
  assert.equal(validPriceRange(new URLSearchParams('min=0&max=0')),true);
  assert.equal(validPriceRange(new URLSearchParams('min=&max=')),true);
  for (const q of ['min=-1','max=Infinity','min=NaN','min=50000&max=10000','min=1e3','max=%20-nan','max=Infinity&sort=price_asc']) {
    assert.equal(validPriceRange(new URLSearchParams(q)),false,q);
    assert.deepEqual(ids(q),[],q);
  }
});
test('sorting still works with service-specific filter, using actual prices only',()=>{
  assert.deepEqual(ids('service=201&sort=price_desc'),[21]);
  assert.deepEqual(ids('service=999&sort=price_asc'),[]);
});
test('catalog full profile link passes existing query as return destination and offers direct booking',async()=>{
  const source=await readFile(new URL('../src/pages/user/explore/ResultCard.jsx',import.meta.url),'utf8');
  assert.match(source,/type === "barbers" \? profileUrl : makeUrl/);
  assert.match(source,/state=\{type === "barbers" \? \{ from: location.pathname \+ location.search \}/);
  assert.match(source,/profileUrl\.split\(\"\?\"\)\[0\]\}\?\$\{bookingQuery\}/);
  assert.match(source,/siteLocalePath/);
  assert.match(source,/bookingProfileQuery\(selectedServiceId, services\)/);
});
test('broken thumbnail fallback keys by actual post/media identity, allowing replacement',async()=>{
  const source=await readFile(new URL('../src/pages/user/barber/BarberPublicProfile.jsx',import.meta.url),'utf8');
  assert.match(source,/key=\{`\$\{item.id\}-\$\{item.media\[0\]\?\.url/);
  assert.match(source,/\/\^\\\/user\\\/explore/);
});

test('address punctuation and dash variations match published areas, without inferring other locations',()=>{
  const area=normalizeCatalog({barbers:[{id:88,first_name:'Olim',last_name:'Saidov',address:'Toshkent, Chilonzor — 8-mavze',services:[]}],salons:[],services:[]});
  const idFor=q=>selectResults(area,'barbers',new URLSearchParams(q),null).map(b=>b.id);
  assert.deepEqual(idFor('area=Chilonzor+8+mavze'),[88]);
  assert.deepEqual(idFor('area=Chilonzor-8'),[88]);
  assert.deepEqual(idFor('area=Yunusobod'),[]);
});
test('map marker opens real public profile preserving current search and sort in return state',async()=>{
  const source=await readFile(new URL('../src/pages/user/BarbersMap.jsx',import.meta.url),'utf8');
  assert.match(source,/from: siteLocaleSwitchUrl\(location, lang\)/);
  assert.equal(siteLocaleSwitchUrl({ pathname: '/user/explore', search: '?q=fade&sort=price_asc&area=Chilonzor&lang=ru&otp=12345&token=secret' }, 'ru'),
    '/user/explore?q=fade&sort=price_asc&area=Chilonzor&lang=ru');
  assert.match(source,/state=\{returnState\}/);
});
