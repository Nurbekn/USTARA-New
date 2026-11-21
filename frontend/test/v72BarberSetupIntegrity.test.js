import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSetupHours, validateSetupHours, validateSetupDraft, setupHoursFromServer, createBarberSetupApi } from '../src/pages/barber/data/setup.js';

const defaults = () => ({ address: 'Toshkent', location: {lat:41.3,lng:69.2}, hours: defaultSetupHours() });
const current = { role:'barber', accountId: 11, profileId: 9, token:'token' };
const response = () => ({ barber: {id:9,verification_status:'pending'}, working_hours: defaultSetupHours().filter(x=>!x.isOff).map(x=>({day_of_week:x.day,start_time:x.start+':00',end_time:x.end+':00'})) });

test('seven valid days and a rest day are accepted', () => assert.equal(validateSetupHours(defaultSetupHours()), ''));
test('duplicate weekday rejected', () => { const h=defaultSetupHours();h[1].day=0;assert.match(validateSetupHours(h),/takrorlangan/); });
test('missing day rejected', () => assert.match(validateSetupHours(defaultSetupHours().slice(1)),/7 kundan/));
test('out-of-range weekday rejected', () => {const h=defaultSetupHours();h[1].day=7;assert.match(validateSetupHours(h),/noto‘g‘ri/);});
test('all days off rejected', () => assert.match(validateSetupHours(defaultSetupHours().map(d=>({...d,isOff:true}))),/Kamida/));
test('invalid time rejected', () => {const h=defaultSetupHours();h[1].start='25:00';assert.match(validateSetupHours(h),/noto‘g‘ri/);});
test('reverse range rejected', () => {const h=defaultSetupHours();h[1].end='08:00';assert.match(validateSetupHours(h),/noto‘g‘ri/);});
test('non-boolean isOff rejected', () => {const h=defaultSetupHours();h[1].isOff=0;assert.match(validateSetupHours(h),/noto‘g‘ri/);});
test('valid address and location accepted', () => assert.deepEqual(validateSetupDraft(defaults()), {}));
test('location without address rejected', () => assert.ok(validateSetupDraft({...defaults(),address:' '}).address));
test('invalid latitude rejected', () => assert.ok(validateSetupDraft({...defaults(),location:{lat:100,lng:30}}).location));
test('overlong address rejected', () => assert.ok(validateSetupDraft({...defaults(),address:'a'.repeat(501)}).address));
test('server duplicate weekday rejected', () => assert.throws(()=>setupHoursFromServer([{day_of_week:1,start_time:'09:00',end_time:'10:00'},{day_of_week:1,start_time:'09:00',end_time:'10:00'}]),/noto‘g‘ri/));
test('server invalid time rejected', () => assert.throws(()=>setupHoursFromServer([{day_of_week:1,start_time:'25:00:00',end_time:'26:00:00'}]),/noto‘g‘ri/));
test('server invalid range rejected', () => assert.throws(()=>setupHoursFromServer([{day_of_week:1,start_time:'18:00:00',end_time:'09:00:00'}]),/noto‘g‘ri/));
test('server partial coordinate rejected', async () => {
  const api=createBarberSetupApi({getSession:()=>current,setSession:()=>assert.fail(),request:async(method,path)=>path.endsWith('/me')?{barber:{id:9,latitude:41.3,longitude:null}}:[]});
  await assert.rejects(api.load(),/joylashuv/);
});
test('load response after account switch rejected', async () => {
  let active=current;
  const api=createBarberSetupApi({getSession:()=>active,setSession:()=>assert.fail(),request:async(method,path)=>{active={...current,accountId:19};return path.endsWith('/me')?{barber:{id:9}}:[];}});
  await assert.rejects(api.load(),/Sessiya o‘zgardi/);
});
test('unconfirmed saved schedule cannot mark setupDone', async () => {
  const saved=[]; const api=createBarberSetupApi({getSession:()=>current,setSession:v=>saved.push(v),request:async()=>({...response(),working_hours:[]})});
  await assert.rejects(api.save(defaults()),/jadvalini tasdiqlamadi/);assert.equal(saved.length,0);
});
test('successful save normalizes address and sets setupDone', async () => {
  const saved=[];let sent;
  const api=createBarberSetupApi({getSession:()=>current,setSession:v=>saved.push(v),request:async(...args)=>{sent=args[2].body;return response();}});
  assert.equal(await api.save({...defaults(),address:'  Toshkent  '}),'/barber/pending');
  assert.equal(sent.address,'Toshkent');assert.equal(saved[0].setupDone,true);
});
