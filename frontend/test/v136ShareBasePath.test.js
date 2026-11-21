import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { publicAppBasePath, canonicalPublicBarberUrl, publicBarberShareData, sharePublicBarberProfile } from '../src/pages/user/barber/publicShare.js';
const barber={id:42,first_name:'Dilshod',last_name:'Karimov',specialty:'Erkaklar sochi'};
const origin='https://nurbekn.github.io';

test('Vite root and GitHub Pages base produce navigable public profile URLs',()=>{
 assert.equal(publicAppBasePath('/'),'');
 assert.equal(publicAppBasePath('/USTARA-New/'),'/USTARA-New');
 assert.equal(canonicalPublicBarberUrl(42,origin,'/USTARA-New/'),`${origin}/USTARA-New/barbers/42`);
 assert.equal(canonicalPublicBarberUrl(42,'http://localhost:5173','/USTARA-New/'),'http://localhost:5173/USTARA-New/barbers/42');
});
test('public deployment path rejects encoded slash, traversal, fragment, query, backslash and user URL',()=>{
 for (const path of ['/USTARA-New', 'USTARA-New/', '/../', '/USTARA-New/?x=1', '/USTARA-New/#a', '/USTARA-New/%2e/', '/USTARA-New\\x/', '//', '/a//b/', 'https://other.test/', '/foo/../../', '/foo/ bar/']) {
  assert.equal(publicAppBasePath(path),null,path);
  assert.equal(canonicalPublicBarberUrl(42,origin,path),null,path);
 }
});
test('valid nested literal base paths retain slash boundaries',()=>{
 assert.equal(canonicalPublicBarberUrl(1,origin,'/site/ustara/'),`${origin}/site/ustara/barbers/1`);
 assert.equal(canonicalPublicBarberUrl(42,origin),`${origin}/barbers/42`);
});
test('missing preview config falls back to real GitHub Pages public route',()=>{
 const data=publicBarberShareData(barber,origin,'','/USTARA-New/');
 assert.equal(data.url,`${origin}/USTARA-New/barbers/42`);
});
test('configured server preview URL stays separate from the React deployment path',()=>{
 const data=publicBarberShareData(barber,origin,'https://preview.ustara.uz','/USTARA-New/');
 assert.equal(data.url,'https://preview.ustara.uz/share/barbers/42');
});
test('invalid configured preview origin fails closed even when fallback base is valid',()=>{
 assert.equal(publicBarberShareData(barber,origin,'http://attacker.example','/USTARA-New/'),null);
});
test('new Web Share and clipboard fallback both use the intended GitHub Pages route',async()=>{
 let shared;
 const a=await sharePublicBarberProfile(barber,origin,{share:async v=>{shared=v;}},'', '/USTARA-New/');
 assert.equal(a.status,'shared');assert.equal(shared.url,`${origin}/USTARA-New/barbers/42`);
 let copied;
 const b=await sharePublicBarberProfile(barber,origin,{clipboard:{writeText:async v=>{copied=v;}}},'', '/USTARA-New/');
 assert.equal(b.status,'copied');assert.equal(copied,shared.url);
});
test('manual fallback exposes exactly one safe public route, no booking or token',async()=>{
 const data={...barber,token:'private_token',booking:'private_booking',phone:'private_phone'};
 const result=await sharePublicBarberProfile(data,origin,{},'', '/USTARA-New/');
 assert.deepEqual(result,{status:'manual',url:`${origin}/USTARA-New/barbers/42`});
 assert.doesNotMatch(JSON.stringify(result),/private_token|private_booking|private_phone/);
});
test('profile share name removes hidden bidi and control characters',()=>{
 const data=publicBarberShareData({...barber,first_name:'D\u202eil\u0000shod',specialty:'Fade\u2066bad\u2069'},origin);
 assert.equal(data.title,'D il shod Karimov');
 assert.doesNotMatch(data.text,/[\u2066-\u2069\u202a-\u202e\x00-\x1f]/);
});
test('long emoji in a public name cannot be cut into invalid surrogate halves',()=>{
 const data=publicBarberShareData({...barber,first_name:'😀'.repeat(95),last_name:''},origin);
 assert.equal([...data.title].length,90);
 assert.equal(data.title,'😀'.repeat(90));
});
test('React component reads Vite BASE_URL and resets stale share response when deployment base changes',()=>{
 const s=fs.readFileSync(new URL('../src/pages/user/barber/PublicProfileShare.jsx', import.meta.url),'utf8');
 assert.match(s,/import\.meta\.env\.BASE_URL/);
 assert.match(s,/\[id, origin, previewOrigin, publicBasePath\]/);
 assert.match(s,/sharePublicBarberProfile\(barber, origin,[\s\S]+previewOrigin, publicBasePath\)/);
});
