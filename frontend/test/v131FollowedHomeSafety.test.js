import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { homeBarberSections, homeSessionIdentity, verifiedHomeFollowing, verifiedHomePromotions } from '../src/pages/user/explore/homeModel.js';
const barbers = [
  {id: 1, first_name:'Ali', location:{lat:41.3,lng:69.2}, services:[{id:21}]},
  {id: 2, first_name:'Vali', location:{lat:41.4,lng:69.3}, services:[]},
  {id: 3, first_name:'Hasan', location:{lat:42,lng:70}, services:[{id:23}]},
  {id: 4, first_name:'Said', services:[{id:24}]},
];
const location = {lat:41.3,lng:69.2};
test('kuzatuvlar faqat tasdiqlangan katalog IDlariga tegishli bo‘ladi',()=>{
  assert.deepEqual(verifiedHomeFollowing(['barber:3','barber:3','barber:999','barber:1'],barbers),['barber:3','barber:1']);
});
test('noto‘g‘ri kuzatuv turi fail-closed ishlaydi',()=>{
  for(const x of [null,{},'barber:1',[1],['customer:1'],['barber:0'],['barber:-1'],['barber:01'],['barber:3?tab=services'],['barber:9007199254740993']])
    assert.throws(()=>verifiedHomeFollowing(x,barbers),/noto‘g‘ri/);
});
test('kuzatilganlar reklama/oddiy kartadan oldin, dublikatlar pastda yo‘q',()=>{
  const selected=homeBarberSections(barbers,['barber:3','barber:1'],location);
  assert.deepEqual(selected.topFollowing.map(x=>x.id),[1,3]);
  assert.deepEqual(selected.rest.map(x=>x.id),[2,4]);
  assert.deepEqual(selected.all.map(x=>x.id),[1,3,2,4]);
  assert.deepEqual(barbers.map(x=>x.id),[1,2,3,4]);
});
test('kuzatilganlar ko‘p bo‘lsa top cheklangan, qolganlar yo‘qolmaydi',()=>{
  const s=homeBarberSections(barbers,['barber:1','barber:2','barber:3','barber:4'],location,2);
  assert.deepEqual(s.topFollowing.map(x=>x.id),[1,2]);
  assert.deepEqual(s.rest.map(x=>x.id),[3,4]);
});
test('kuzatuv yo‘q yoki nashr etilmagan bo‘lsa alohida bo‘lim chiqmaydi',()=>{
  assert.deepEqual(homeBarberSections(barbers,['barber:123'],location).topFollowing,[]);
  assert.deepEqual(homeBarberSections(barbers,[],location).rest.map(x=>x.id),[1,2,3,4]);
});
test('cheklovlar noto‘g‘ri bo‘lsa rad etiladi',()=>{
  for(const value of [0,-1,1.2,25,Infinity,null]) assert.throws(()=>homeBarberSections(barbers,[],location,value),/limiti/);
});
test('reklama ID faqat server katalogida bo‘lsa chiqadi',()=>{
  assert.deepEqual(verifiedHomePromotions([3,'3',1,999],barbers),[3,1]);
});
test('reklama soxta ID yoki matnni qabul qilmaydi',()=>{
  for(const value of [null,'1',[null],[-1],[0],['01'],['3;4'],[{}],[3.1],[Number.MAX_SAFE_INTEGER+1]])
    assert.throws(()=>verifiedHomePromotions(value,barbers),/noto‘g‘ri/);
});
test('session identity token va profilga bog‘lanadi',()=>{
  const base={role:'customer',accountId:12,profileId:20,token:'jwt-1'};
  assert.equal(homeSessionIdentity(base),'12:20:jwt-1');
  assert.notEqual(homeSessionIdentity({...base,token:'jwt-2'}),homeSessionIdentity(base));
  assert.notEqual(homeSessionIdentity({...base,accountId:13}),homeSessionIdentity(base));
  assert.notEqual(homeSessionIdentity({...base,profileId:21}),homeSessionIdentity(base));
});
test('anonim va yaroqsiz sessiyalar ro‘yxatni ko‘ra olmaydi',()=>{
  for(const value of [null,{}, {role:'barber',accountId:12,profileId:20,token:'jwt'}, {role:'customer',accountId:0,profileId:20,token:'jwt'},{role:'customer',accountId:12,profileId:20,token:''}])
    assert.equal(homeSessionIdentity(value),null);
});
test('Home akkaunt o‘zgarganda eski kartalarni renderdan yashiradi va abort qiladi',async()=>{
  const src=await readFile(new URL('../src/pages/user/UserHome.jsx',import.meta.url),'utf8');
  assert.match(src,/subscribeSession\(/);
  assert.match(src,/homeSessionIdentity\(getSession\(\)\) !== sessionIdentity/);
  assert.match(src,/controller\.abort\(\)/);
  assert.match(src,/visibleState = homeSessionIdentity\(getSession\(\)\) === sessionIdentity/);
  assert.match(src,/setState\(emptyHome\(\)\)/);
});
test('kuzatilganlar bo‘limi reklama va uslublardan oldin joylashgan',async()=>{
  const src=await readFile(new URL('../src/pages/user/UserHome.jsx',import.meta.url),'utf8');
  const followed=src.indexOf('aria-labelledby="uh-follow-title"');
  assert.ok(followed>0 && followed<src.indexOf('className="uh-featured"'));
  assert.ok(followed<src.indexOf('<StyleGallery lang={lang} ui={ui}/>'));
  assert.match(src,/sections\.rest\.map\(barber/);
  assert.match(src,/canBookBarber\(barber\)/);
});
test('social/reklama/bron xatosi boshqasidan mustaqil ko‘rsatiladi',async()=>{
  const src=await readFile(new URL('../src/pages/user/UserHome.jsx',import.meta.url),'utf8');
  assert.match(src,/Kuzatuvlar tekshirilmadi/);
  assert.match(src,/Reklamalar tekshirilmadi/);
  assert.match(src,/Bronlar yuklanmadi/);
  assert.match(src,/directory\.status === 'fulfilled' \? 'ready' : 'error'/);
});
