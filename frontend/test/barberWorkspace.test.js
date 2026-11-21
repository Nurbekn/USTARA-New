import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { earningsSeries } from '../src/pages/barber/data/earnings.js';
import { getAvailability } from '../src/pages/barber/data/availability.js';
import { parseCheckIn } from '../src/pages/user/bookings/checkInV170.js';
test('daromad bo‘lmasa nol, faqat davrdagi summalar diagrammaga tushadi', () => {
  const now = new Date('2026-11-18T05:00:00Z');
  const empty = earningsSeries([],7,now);assert.equal(empty.length,7);assert.ok(empty.every(d => d.amount === 0));
  const series = earningsSeries([{ day:'2026-11-18',amount:'50000',count:1 },{day:'2026-11-18',amount:20000,count:1},{day:'2026-10-18',amount:999,count:1}],7,now);
  assert.equal(series.at(-1).amount,70000);assert.equal(series.at(-1).count,2);assert.equal(series.reduce((n,d)=>n+d.amount,0),70000);
});
test('ish holati serverdagi qabul va Toshkent jadvalidan olinadi', () => {
  const profile = { acceptingBookings:true,hours:[{day:1,isOff:false,start:'09:00',end:'18:00'}] };
  assert.equal(getAvailability(profile,new Date('2026-11-16T05:00:00Z')).isOpen,true);
  assert.equal(getAvailability(profile,new Date('2026-11-16T14:00:00Z')).isOpen,false);
  assert.equal(getAvailability({...profile,acceptingBookings:false},new Date('2026-11-16T05:00:00Z')).isOpen,false);
});
const bridge = { getSession:()=>({role:'barber',token:'unit',profileId:7}), request:null, parseCheckIn, resolveMediaUrl:url=>'http://localhost:5000'+url };
globalThis.__barberWorkspaceTest=bridge;
let source=await readFile(new URL('../src/pages/barber/data/store.js',import.meta.url),'utf8');
source=source.replace(/import \{ useEffect, useSyncExternalStore \} from "react";/,'const useEffect=()=>{};const useSyncExternalStore=(_s,get)=>get();').replace(/import \{ request, resolveMediaUrl \} from "[^"]+";/,'const {resolveMediaUrl}=globalThis.__barberWorkspaceTest;const request=(...a)=>globalThis.__barberWorkspaceTest.request(...a);').replace(/import \{ getSession \} from "[^"]+";/,'const {getSession}=globalThis.__barberWorkspaceTest;').replace(/import \{ parseCheckIn \} from "[^"]+";/,'const {parseCheckIn}=globalThis.__barberWorkspaceTest;');
const store=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function replies(failPortfolio=false){return async(_method,path)=>{
  if(path==='/api/barbers/me')return {barber:{id:7,first_name:'Ali',last_name:'Usta',accepting_bookings:true,verification_status:'approved'}};
  if(path==='/api/barbers/working-hours')return [{day_of_week:1,start_time:'09:00:00',end_time:'18:00:00'}];
  if(path.endsWith('/reviews/me'))return {reviews:[]};
  if(path.endsWith('/portfolio')){if(failPortfolio)throw Error('Portfolio unavailable');return {followerCount:0,followingCount:0,posts:[{id:3,media:[{type:'image',url:'/api/media/9'}],serviceIds:[],likeCount:0,commentCount:0}]};}
  return [];
};}
test('portfolio xatosi saqlangan profil va jadvalni yo‘qotmaydi',async()=>{
  bridge.request=replies(true);assert.equal(await store.refreshBarberData(),true);
  const state=store.useBarber();assert.equal(state.status,'ready');assert.equal(state.profile.id,7);assert.equal(state.profile.hours[1].isOff,false);assert.ok(state.errors.posts);
});
test('portfolio media API serverga yo‘naltiriladi va hisoblagich nol bo‘la oladi',async()=>{
  bridge.request=replies();await store.refreshBarberData();const state=store.useBarber();assert.equal(state.posts[0].image,'http://localhost:5000/api/media/9');assert.equal(state.profile.followers,0);assert.equal(state.profile.acceptingBookings,true);
});
