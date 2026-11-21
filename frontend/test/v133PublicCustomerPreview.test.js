import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { publicProfileChecklist, publicProfilePreview, verifiedPublicId } from '../src/pages/barber/data/publicPreview.js';

const profile={ id: 41, firstName:'Ali', lastName:'Karimov', phone:'+998901234567', about:'Sartarosh', address:'Chilonzor', location:{lat:41.3,lng:69.2}, verification_status:'approved', services:[{id:5,name:'Soch',price:55000,active:true}], hours:[{day:1,isOff:false,start:'09:00',end:'18:00'}], avatarPhoto:'https://example.com/a.jpg' };
const posts=[{id:7}];
const session={role:'barber',token:'private-token-xyz',profileId:41};
const options={session,status:'ready',posts};

test('approved current owner opens the existing PUBLIC guest route, not customer login route',()=>{
 const view=publicProfilePreview(profile,options);
 assert.equal(view.canOpen,true); assert.equal(view.url,'/barbers/41');
 assert.equal(view.readyCount,7); assert.equal(view.checks.length,7);
});
test('pending, suspended and rejected owner have no public preview link',()=>{
 for(const status of ['pending','rejected','suspended',null]) {
  const out=publicProfilePreview({...profile,verification_status:status},options);
  assert.equal(out.canOpen,false); assert.equal(out.url,null);
  assert.match(out.message,/tasdiqlanmagan/);
 }
});
test('loading and failed profile load never leak stale public preview link',()=>{
 for(const status of ['loading','idle','error']) {
  assert.equal(publicProfilePreview(profile,{...options,status}).url,null);
 }
});
test('owner account mismatch and missing token are rejected even with approved profile',()=>{
 for(const sessionChange of [{...session,profileId:42},{...session,role:'customer'},{...session,token:''},null]) {
  assert.equal(verifiedPublicId(profile,sessionChange),null);
  assert.equal(publicProfilePreview(profile,{...options,session:sessionChange}).url,null);
 }
});
test('unsafe/malformed IDs cannot enter a link',()=>{
 for(const id of [0,-1,1.5,'41',NaN,Infinity,2147483648,Number.MAX_SAFE_INTEGER,null]) {
  assert.equal(publicProfilePreview({...profile,id},{...options,session:{...session,profileId:id}}).url,null);
 }
});
test('session identity must be exact, not string-number or same phone',()=>{
 assert.equal(verifiedPublicId(profile,{...session,profileId:'41'}),null);
 assert.equal(verifiedPublicId({...profile,phone:'123'}, {...session,profileId:43}),null);
});
test('existing unsaved edits are warned about; preview still shows SAVED server state',()=>{
 const x=publicProfilePreview(profile,{...options,dirty:true});
 assert.match(x.unsavedWarning,/Saqlanmagan/);assert.equal(x.url,'/barbers/41');
 assert.equal(publicProfilePreview(profile,options).unsavedWarning,null);
});
test('checklist reports clear missing name, bio, address, map, services, hours and posts',()=>{
 const x=publicProfileChecklist({id:41,firstName:' ',about:'',address:'',location:null,services:[],hours:[]},[]);
 assert.deepEqual(x.map(z=>z.ok),Array(7).fill(false));
 assert.ok(x.every(z=>z.to.startsWith('/barber/')));
});
test('unavailable API service/hour/post data is UNKNOWN, not falsely missing',()=>{
 const x=publicProfileChecklist({...profile,services:[],hours:[]},[],{services:'network',hours:'network',posts:'network'});
 assert.equal(x.find(z=>z.key==='services').ok,null);
 assert.equal(x.find(z=>z.key==='hours').ok,null);
 assert.equal(x.find(z=>z.key==='portfolio').ok,null);
 assert.equal(x.find(z=>z.key==='name').ok,true);
});
test('disabled service, invalid price and closed hours do not imply ready',()=>{
 const x=publicProfileChecklist({...profile,services:[{name:'Soch',active:false,price:55000}],hours:[{isOff:true,start:'09:00',end:'18:00'}]},posts);
 assert.equal(x.find(z=>z.key==='services').ok,false);
 assert.equal(x.find(z=>z.key==='hours').ok,false);
});
test('coordinates are validated within geographical range',()=>{
 for(const location of [{lat:91,lng:2},{lat:1,lng:181},{lat:'41',lng:2},{lat:Infinity,lng:2}])
   assert.equal(publicProfileChecklist({...profile,location},posts).find(z=>z.key==='map').ok,false);
});
test('readiness score counts only confirmed data, not unknowns',()=>{
 const x=publicProfilePreview({...profile,services:[],hours:[]},{...options,posts:[],errors:{services:'network',hours:'network',posts:'network'}});
 assert.equal(x.readyCount,4); assert.equal(x.unknownCount,3);
});
test('preview state does not return phone number, auth token, password or booking data',()=>{
 const x=publicProfilePreview({...profile,password:'secret',bookings:[{phone:'private'}]},options);
 const printed=JSON.stringify(x);
 assert.ok(!printed.includes(profile.phone));
 assert.ok(!printed.includes(session.token));
 assert.ok(!printed.includes('secret'));
});
test('barber profile, portfolio and home all include the shared preview widget',async()=>{
 for(const name of ['Profile.jsx','Portfolio.jsx','Dashboard.jsx']) {
  const s=await readFile(new URL(`../src/pages/barber/${name}`,import.meta.url),'utf8');
  assert.match(s,/PublicProfilePreviewCard/);
  assert.match(s,/status=\{status\}/);
 }
});
test('widget uses accessible public link and warns about limited guest view',async()=>{
 const s=await readFile(new URL('../src/pages/barber/components/PublicProfilePreviewCard.jsx',import.meta.url),'utf8');
 assert.match(s,/rel="noopener noreferrer"/);
 assert.match(s,/target="_blank"/);
 assert.match(s,/Ommaviy mehmon ko‘rinishi/);
 assert.match(s,/aria-labelledby/);
 assert.match(s,/role="status"/);
});
test('public guest route never sends barber JWT or uses authenticated customer endpoints',async()=>{
 const s=await readFile(new URL('../src/pages/user/barber/BarberPublicProfile.jsx',import.meta.url),'utf8');
 assert.match(s,/customerRoute && getSession\(\)\?\.role === "customer"/);
 assert.match(s,/!customerRoute && <p className="bpv-guest-note"/);
 assert.match(s,/ui\.guest/);
 assert.match(await readFile(new URL('../src/pages/user/barber/publicProfileLocale.js',import.meta.url),'utf8'),/Ommaviy mehmon ko‘rinishi/);
});
test('public preview cannot silently publish a draft or modify data',async()=>{
 const s=await readFile(new URL('../src/pages/barber/components/PublicProfilePreviewCard.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(s,/publishProfile|updateProfile|fetch\(/);
 const view=publicProfilePreview(profile,options);
 assert.equal(view.canOpen,true);
 assert.ok(view.checks.every(x=>!Object.hasOwn(x,'phone')));
});
