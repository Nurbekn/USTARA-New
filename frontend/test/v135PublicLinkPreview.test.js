import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { publicProfilePreviewUrl, publicBarberShareData, sharePublicBarberProfile } from '../src/pages/user/barber/publicShare.js';
const host='https://ustara.uz';
const preview='https://preview.ustara.uz';
const barber={id:41,firstName:'Sara',lastName:'Karimova',specialty:'Soch turmaklash'};
test('configured preview origin yields server-renderable URL',()=>{
 assert.equal(publicProfilePreviewUrl(41,preview),'https://preview.ustara.uz/share/barbers/41');
});
test('preview link rejects malformed origin, token, URL paths, and unsafe IDs',()=>{
 for(const x of ['http://untrusted.example','https://example.com?token=1','https://x.test/a','https://a:p@x.test','javascript:alert(1)']) assert.equal(publicProfilePreviewUrl(41,x),null);
 for(const id of ['41','/41',0,-1,2147483648]) assert.equal(publicProfilePreviewUrl(id,preview),null);
});
test('sharing prefers configured server preview URL, strips sensitive input',()=>{
 const data=publicBarberShareData({...barber,token:'SECRET',phone:'998xxxxx',booking:'PRIVATE'},host,preview);
 assert.equal(data.url,'https://preview.ustara.uz/share/barbers/41');
 assert.doesNotMatch(JSON.stringify(data),/SECRET|998xxxxx|PRIVATE/);
});
test('no configured preview origin keeps original canonical direct profile URL',()=>{
 assert.equal(publicBarberShareData(barber,host).url,`${host}/barbers/41`);
});
test('invalid configured origin fails closed rather than pretending it has OG support',()=>{
 assert.equal(publicBarberShareData(barber,host,'http://evil.example'),null);
});
test('Web Share sends only the public preview link',async()=>{
 let payload;const r=await sharePublicBarberProfile(barber,host,{share:async p=>{payload=p;}},preview);
 assert.equal(r.status,'shared');assert.equal(payload.url,`${preview}/share/barbers/41`);
});
test('clipboard fallback copies preview URL',async()=>{
 let url;const r=await sharePublicBarberProfile(barber,host,{clipboard:{writeText:async s=>{url=s;}}},preview);
 assert.equal(r.status,'copied');assert.equal(url,`${preview}/share/barbers/41`);
});
test('manual fallback exposes only preview link when browser forbids clipboard',async()=>{
 const r=await sharePublicBarberProfile(barber,host,{},preview);
 assert.deepEqual(r,{status:'manual',url:`${preview}/share/barbers/41`});
});
test('frontend share component uses build-time public preview origin and never reads token',()=>{
 const s=fs.readFileSync(new URL('../src/pages/user/barber/PublicProfileShare.jsx',import.meta.url),'utf8');
 assert.match(s,/VITE_PUBLIC_PROFILE_PREVIEW_ORIGIN/);
 assert.match(s,/sharePublicBarberProfile\(barber, origin/);
 assert.doesNotMatch(s,/localStorage|sessionStorage/);
});
