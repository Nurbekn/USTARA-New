import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {blankShopV172,formFromShopV172,shopPublicIdV172,shopTextV172} from '../src/pages/shops/shopLocaleV172.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('#119: one address and no implicit permissions in form model',()=>{
 assert.deepEqual(Object.keys(blankShopV172()).sort(),['address','description','expectedRevision','name','published'].sort());
 const x=formFromShopV172({name:'A',address:'B',description:'',published:true,revision:7});
 assert.equal(x.expectedRevision,7);assert.equal(x.published,true);
 assert.equal(shopPublicIdV172(1),1);assert.equal(shopPublicIdV172(-1),null);
});
test('#120: UZ/RU/EN shop copy does not claim verification',()=>{
 for(const lang of ['uz','ru','en']){const copy=shopTextV172(lang);assert.ok(copy.notVerified);assert.ok(copy.notice);assert.ok(copy.offline);}
});
test('#120: owner edit blocks uncertain mutations until read refresh',()=>{
 const src=read('../src/pages/shops/ShopEditV172.jsx');
 assert.match(src,/saving\|\|unknown/);assert.match(src,/setUnknown\(true\)/);assert.match(src,/setAttempt\(x=>x\+1\)/);
});
test('#120: public route only links to individual barber; no shared team booking',()=>{
 const src=read('../src/pages/shops/ShopPublicV172.jsx');
 assert.match(src,/barbers\/\$\{current\.shop\.ownerBarberId\}/);
 assert.doesNotMatch(src,/POST.*bookings|teamMembers/);
 const app=read('../src/App.jsx');assert.match(app,/path="\/shops\/:id"/);assert.match(app,/path="shop" element=\{<ShopEditV172/);
});
