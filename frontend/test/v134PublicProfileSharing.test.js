import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalPublicBarberUrl, publicBarberShareData, sharePublicBarberProfile } from '../src/pages/user/barber/publicShare.js';
import { publicProfilePreview } from '../src/pages/barber/data/publicPreview.js';

const barber = {id:41,first_name:'Ali',last_name:'Olimov',salon_name:'USTARA Salon',specialty:'Soch ustasi',phone:'+998901234567',customer_phone:'+998977777777',token:'SECRET',bookings:[{id:21}]};
const origin='https://ustara.uz';

test('canonical route is public /barbers/id (never /user/barbers or query tokens)',()=>{
 assert.equal(canonicalPublicBarberUrl(41,origin),'https://ustara.uz/barbers/41');
 assert.equal(canonicalPublicBarberUrl(41,'http://localhost:5173'),'http://localhost:5173/barbers/41');
 assert.equal(canonicalPublicBarberUrl(41,'http://127.0.0.1:4173'),'http://127.0.0.1:4173/barbers/41');
});
test('unsafe IDs and type coercions are rejected, never construct a share link',()=>{
 for(const id of [0,-1,1.2,'41','/41',null,undefined,NaN,Infinity,2147483648,Number.MAX_SAFE_INTEGER]) assert.equal(canonicalPublicBarberUrl(id,origin),null);
});
test('noncanonical, credential-bearing, HTTP public origins and query/fragment are rejected',()=>{
 for(const value of ['http://ustara.uz','https://bad.example/a','https://bad.example/?token=abc','https://bad.example/#secret','https://admin:pw@ustara.uz','javascript:alert(1)','ftp://ustara.uz','https://ustara.uz:9999/path','']) assert.equal(canonicalPublicBarberUrl(41,value),null);
});
test('published share text carries only public name and specialty',()=>{
 const data=publicBarberShareData(barber,origin);
 assert.deepEqual(data,{title:'Ali Olimov — USTARA Salon',text:'Soch ustasi • USTARA ommaviy profil',url:'https://ustara.uz/barbers/41'});
 const encoded=JSON.stringify(data);
 for(const secret of [barber.phone,barber.customer_phone,barber.token,'bookings','customer_phone']) assert.ok(!encoded.includes(secret));
});
test('malformed public metadata is not executed or added to URL; overly long text truncated',()=>{
 const bad={id:41, first_name:101, last_name:'  Vali\n   Karimov ', salon_name:'a'.repeat(400), specialty:{secret:'x'}};
 const data=publicBarberShareData(bad,origin);
 assert.equal(data.url,'https://ustara.uz/barbers/41');
 assert.ok(data.title.length<= 'Vali Karimov — '.length+90);
 assert.equal(data.text,'USTARA ommaviy profil');
 assert.ok(!data.title.includes('\n'));
});
test('invalid profile or origin cannot expose any link',()=>{
 assert.equal(publicBarberShareData(null,origin),null);
 assert.equal(publicBarberShareData({...barber,id:-4},origin),null);
 assert.equal(publicBarberShareData(barber,'https://ustara.uz/?authorization=token'),null);
});
test('Web Share API receives only a clean public payload, and reports shared',async()=>{
 let payload;
 const result=await sharePublicBarberProfile(barber,origin,{share:async data=>{payload=data;}});
 assert.equal(result.status,'shared');
 assert.equal(payload.url,'https://ustara.uz/barbers/41');
 assert.deepEqual(Object.keys(payload),['title','text','url']);
});
test('user-cancelled native share does not copy unexpectedly or report failure',async()=>{
 let copied=false;
 const result=await sharePublicBarberProfile(barber,origin,{share:async()=>{const error=new Error('cancel');error.name='AbortError';throw error;},clipboard:{writeText:async()=>{copied=true;}}});
 assert.deepEqual(result,{status:'cancelled',url:null});assert.equal(copied,false);
});
test('native share failure falls back to clipboard copying ONLY the URL',async()=>{
 let copied;
 const result=await sharePublicBarberProfile(barber,origin,{share:async()=>{throw new Error('blocked');},clipboard:{writeText:async x=>{copied=x;}}});
 assert.equal(result.status,'copied');assert.equal(copied,'https://ustara.uz/barbers/41');
});
test('browsers without native share use clipboard',async()=>{
 let copied='';const result=await sharePublicBarberProfile(barber,origin,{clipboard:{writeText:async x=>{copied=x;}}});
 assert.equal(result.status,'copied');assert.equal(copied,result.url);
});
test('blocked clipboard returns safe URL for manual selection',async()=>{
 const result=await sharePublicBarberProfile(barber,origin,{clipboard:{writeText:async()=>{throw Error('blocked')}}});
 assert.deepEqual(result,{status:'manual',url:'https://ustara.uz/barbers/41'});
 assert.equal((await sharePublicBarberProfile(barber,origin,{})).status,'manual');
});
test('refuses to call any browser share function with invalid profile',async()=>{
 let called=false;const result=await sharePublicBarberProfile({...barber,id:'41'},origin,{share:async()=>{called=true;}});
 assert.deepEqual(result,{status:'unavailable',url:null});assert.equal(called,false);
});
test('owner share appears only within previously verified approved preview',async()=>{
 const session={role:'barber',token:'jwt-private',profileId:41};
 const profile={id:41,firstName:'Ali',verification_status:'approved'};
 assert.equal(publicProfilePreview(profile,{session,status:'ready'}).canOpen,true);
 assert.equal(publicProfilePreview({...profile,verification_status:'pending'},{session,status:'ready'}).canOpen,false);
 const widget=await readFile(new URL('../src/pages/barber/components/PublicProfilePreviewCard.jsx',import.meta.url),'utf8');
 assert.match(widget,/view\.canOpen && <PublicProfileShare/);
 assert.doesNotMatch(widget,/token:\s*session\.token/);
});
test('both owner and public profile mount same share component',async()=>{
 const owner=await readFile(new URL('../src/pages/barber/components/PublicProfilePreviewCard.jsx',import.meta.url),'utf8');
 const guest=await readFile(new URL('../src/pages/user/barber/BarberPublicProfile.jsx',import.meta.url),'utf8');
 assert.match(owner,/PublicProfileShare/);assert.match(guest,/<PublicProfileShare barber=\{barber\}/);
});
test('component has manual copy fallback, screen-reader feedback and stale async result protection',async()=>{
 const s=await readFile(new URL('../src/pages/user/barber/PublicProfileShare.jsx',import.meta.url),'utf8');
 assert.match(s,/role="status" aria-live="polite"/);
 assert.match(s,/readOnly value=\{preview\.url\}/);
 assert.match(s,/request !== generation\.current/);
 assert.match(s,/return \(\) => \{ generation\.current \+= 1; \}/);
 assert.doesNotMatch(s,/localStorage|sessionStorage|document\.cookie/);
});
test('sharing does not send any backend mutation and social OG preview remains unverified',async()=>{
 const share=await readFile(new URL('../src/pages/user/barber/publicShare.js',import.meta.url),'utf8');
 assert.doesNotMatch(share,/fetch\(|request\(|axios|POST|PUT|DELETE/);
 assert.doesNotMatch(share,/og:image|og:title|twitter:card/);
});
