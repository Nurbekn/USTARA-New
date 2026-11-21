import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicBarberMapLinksV175, publicNavigationTextV175 } from '../src/pages/user/barber/publicNavigationV175.js';

const profile = {id:11,latitude:41.3123,longitude:69.2787,phone:'+998900001122',address:'Private test marker'};

test('#141: public profile offers Google, Yandex, 2GIS and OpenStreetMap', () => {
 const links=publicBarberMapLinksV175(profile);
 assert.deepEqual(links.map(link=>link.name),['Google Maps','Yandex Maps','2GIS','OpenStreetMap']);
 for(const item of links) {
  const parsed=new URL(item.href);
  assert.equal(parsed.protocol,'https:');
  assert.ok(['www.google.com','yandex.uz','2gis.uz','www.openstreetmap.org'].includes(parsed.hostname));
  assert.ok(!item.href.includes(profile.phone));
  assert.ok(!item.href.includes('Private'));
 }
 assert.equal(new URL(links[0].href).searchParams.get('query'),'41.3123,69.2787');
 assert.equal(new URL(links[1].href).searchParams.get('pt'),'69.2787,41.3123');
 assert.match(links[2].href,/69\.2787,41\.3123$/);
});

test('#141: no unverified location, no guessed address, no unsafe data', () => {
 for(const p of [null,{}, {address:'Tashkent'}, {latitude:'41.3',longitude:69},
  {latitude:91,longitude:69}, {latitude:41,longitude:181},
  {latitude:NaN,longitude:69}, {latitude:41,longitude:undefined},
  {latitude:Infinity,longitude:69}, {latitude:41,longitude:'javascript:alert(1)'}]) {
  assert.deepEqual(publicBarberMapLinksV175(p),[]);
 }
});

test('#141: location on the edge of the valid geographic range is not silently modified', () => {
 assert.equal(publicBarberMapLinksV175({latitude:0,longitude:0}).length,4);
 assert.equal(publicBarberMapLinksV175({latitude:-90,longitude:180}).length,4);
});

test('#141: localization and accessible hint distinguish location from route guidance', () => {
 const labels=['uz','ru','en'].map(lang=>publicNavigationTextV175(lang));
 assert.equal(new Set(labels.map(x=>x.open)).size,3);
 for(const copy of labels) assert.ok(copy.open.length && copy.hint.length);
 assert.deepEqual(publicNavigationTextV175('invalid'),labels[0]);
});

test('#141: guest public profile links are safe and no request is sent by the page itself', () => {
 const jsx=readFileSync(new URL('../src/pages/user/barber/BarberPublicProfile.jsx', import.meta.url),'utf8');
 assert.match(jsx,/publicBarberMapLinksV175\(barber\)/);
 assert.match(jsx,/mapLinks\.length > 0/);
 assert.match(jsx,/href=\{link\.href\}/);
 assert.match(jsx,/target="_blank" rel="noopener noreferrer"/);
 assert.match(jsx,/<details className="bpv-navigation-v175"/);
 assert.doesNotMatch(jsx,/window\.location\s*=/);
});
