import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mapBookingHref, mapProfileHref, mappedBarbers } from '../src/pages/user/explore/mapLinks.js';
import { normalizeCatalog, selectResults } from '../src/pages/user/explore/catalog.js';

const one = { id: 12, first_name: 'Ali', last_name: 'Olimov', address: 'Yunusobod', location: {lat:41.31,lng:69.28}, services:[{id:9,name:'Fade',barberIds:[12]},{id:7,name:'Soch',barberIds:[12]}] };
const two = {id:13,first_name:'Vali',location:{lat:41.35,lng:69.28},services:[]};
const missing = {id:14,first_name:'Olim',services:[{id:3}]};
const catalog = normalizeCatalog({barbers:[one,two,missing],salons:[],services:[]});
const ids = (query,location) => selectResults(catalog,'barbers',new URLSearchParams(query),location).map(b=>b.id);

test('map excludes unlocated records rather than assigning default positions', () => {
  assert.deepEqual(mappedBarbers([one,two,missing]).map(x=>x.id),[12,13]);
  assert.deepEqual(mappedBarbers([]),[]);
});
test('map never links invalid or duplicate-less malformed identity', () => {
  assert.equal(mapProfileHref({...one,id:0}),null);
  assert.equal(mapProfileHref({...one,id:'12'}),null);
  assert.equal(mapProfileHref(one),'/user/barbers/12');
});
test('map path respects guest and logged-in route prefixes', () => {
  assert.equal(mapProfileHref(one,''),'/barbers/12');
  assert.equal(mapProfileHref(one,'/user'),'/user/barbers/12');
});
test('booking requires actual listed positive service ID', () => {
  assert.equal(mapBookingHref(two,null),null);
  assert.equal(mapBookingHref({...one,services:[{id:-5}]},null),null);
  assert.equal(mapBookingHref({...one,services:[{id:'9'}]},null),null);
});
test('map booking sends user to services tab, not an automatic booking', () => {
  assert.equal(mapBookingHref(one,null),'/user/barbers/12?tab=services');
});
test('selected service is preserved when actually published by that barber', () => {
  assert.equal(mapBookingHref(one,'9'),'/user/barbers/12?tab=services&services=9');
});
test('wrong or stale service never preselects unrelated barber booking', () => {
  assert.equal(mapBookingHref(one,'55'),'/user/barbers/12?tab=services');
  assert.equal(mapBookingHref(two,'9'),null);
});
test('known user location is required for distance filtering as before', () => {
  assert.deepEqual(ids('distance=5',null),[]);
  assert.deepEqual(ids('distance=5',{lat:41.30,lng:69.28}),[12]);
});
test('map never accepts invalid lat or longitude', () => {
  assert.deepEqual(mappedBarbers([one,{...one,id:20,location:{lat:900,lng:69}}]),[one]);
});
test('map provides popup with keyboard-focusable profile and booking links',async()=>{
  const source=await readFile(new URL('../src/pages/user/BarbersMap.jsx',import.meta.url),'utf8');
  assert.match(source,/<Popup>/);
  assert.match(source,/to=\{siteLocalePath\(mapProfileHref\(b, profilePrefix\), lang\)\}/);
  assert.match(source,/to=\{siteLocalePath\(mapBookingHref\(b, selectedServiceId, profilePrefix\), lang\)\}/);
  assert.match(source,/state=\{returnState\}/);
  assert.match(source,/from: siteLocaleSwitchUrl\(location, lang\)/);
  assert.match(source,/readSiteLocale\(location.search\)/);
});
test('no coordinates offers list recovery without fabricated pins',async()=>{
  const source=await readFile(new URL('../src/pages/user/BarbersMap.jsx',import.meta.url),'utf8');
  assert.match(source,/if \(!mapped\.length\)/);
  assert.match(source,/onShowList && <button/);
  assert.match(source,/Ro‘yxatga o‘tish/);
});
test('tile loading errors offer a list fallback',async()=>{
  const source=await readFile(new URL('../src/pages/user/BarbersMap.jsx',import.meta.url),'utf8');
  assert.match(source, /tilesError && <div/);
  assert.match(source, /role="alert"/);
});
test('Explore wires selected service and switching to list',async()=>{
  const source=await readFile(new URL('../src/pages/user/Explore.jsx',import.meta.url),'utf8');
  assert.match(source,/selectedServiceId=\{params.get\("service"\)\}/);
  assert.match(source,/onShowList=\{\(\) => update\(\{ map: null \}\)\}/);
});
test('missing location with distance filter shows an explicit explanation',async()=>{
  const source=await readFile(new URL('../src/pages/user/Explore.jsx',import.meta.url),'utf8');
  assert.match(source,/const needsLocation = params.get\("sort"\) === "distance_asc" \|\| !!params.get\("distance"\)/);
  assert.match(source,/needsLocation && !hasLocation/);
  assert.match(source,/ui\.badLocation/);
  const {customerCoreUi}=await import('../src/pages/user/coreLocale.js');
  assert.match(customerCoreUi('uz').explore.badLocation,/Masofa bo‘yicha qidirish yoki tartiblash/);
});
test('map popup links receive visible keyboard focus',async()=>{
  const source=await readFile(new URL('../src/pages/user/BarbersMap.css',import.meta.url),'utf8');
  assert.match(source,/\.ex-map-popup a:focus-visible/);
  assert.match(source,/min-height: 44px/);
});
