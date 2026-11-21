import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectionV173,moveGalleryPostV173,shopGalleryTextV173} from '../src/pages/shops/shopGalleryLocaleV173.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('#124 max eight selected and no duplicates',()=>{
 const eight=[1,2,3,4,5,6,7,8];assert.deepEqual(selectionV173(eight,9,true),eight);
 assert.deepEqual(selectionV173(eight,4,true),eight);
 assert.deepEqual(selectionV173(eight,4,false),[1,2,3,5,6,7,8]);
});
test('#124 reorder never loses items',()=>{
 assert.deepEqual(moveGalleryPostV173([1,2,3],2,-1),[2,1,3]);
 assert.deepEqual(moveGalleryPostV173([1,2,3],1,-1),[1,2,3]);
 assert.deepEqual(moveGalleryPostV173([1,2,3],4,1),[1,2,3]);
});
test('#124 gallery is available in three languages',()=>{
 for(const l of ['uz','ru','en']){const t=shopGalleryTextV173(l);assert.ok(t.unknown);assert.ok(t.save);assert.ok(t.empty);}
});
test('#124 public images come from controlled media endpoint and are lazy-loaded',()=>{
 const src=read('../src/pages/shops/ShopPublicV172.jsx');
 assert.match(src,/current.shop.gallery/);assert.match(src,/resolveMediaUrl\(item.mediaUrl\)/);
 assert.match(src,/loading="lazy"/);assert.doesNotMatch(src,/iframe|dangerouslySetInnerHTML/);
});
test('#124 uncertain gallery writes force server reread before resubmission',()=>{
 const src=read('../src/pages/shops/ShopGalleryV173.jsx');
 assert.match(src,/saving\|\|unknown/);assert.match(src,/setUnknown\(true\)/);
 assert.match(src,/expectedRevision:state.data.revision/);assert.match(src,/setReload\(n=>n\+1\)/);
});
