import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureBookingConfirmation, isBookingConfirmationCurrent, CONFIRMATION_QUOTE_MAX_AGE_MS } from '../src/pages/user/barber/bookingConfirmation.js';

const NOW = 2_000_000_000_000;
const base = () => ({
  barberId: 21, serviceIds: [12, 13], date: '2033-03-21',
  selected: {time: '09:35', endTime: '10:05', available: true},
  quote: '51000.00', duration: 30, serviceName: 'Soch + soqol',
  policy: {cutoff_minutes: 60, text:'Oldindan ogohlantiring'},
  quoteReceivedAt: NOW - 1_000,
});
const capture = (change = {}, now = NOW) => captureBookingConfirmation({...base(), ...change}, now);
test('v85: captures the exact displayed quote and freezes all mutable selection IDs', () => {
  const input = base();
  const snap = captureBookingConfirmation(input, NOW);
  assert.deepEqual(snap.serviceIds,[12,13]);
  assert.equal(snap.price,'51000.00');
  assert.equal(snap.time,'09:35');
  assert.equal(snap.endTime,'10:05');
  assert.equal(snap.duration,30);
  assert.equal(snap.policyText,'Oldindan ogohlantiring');
  assert.ok(Object.isFrozen(snap) && Object.isFrozen(snap.serviceIds));
  input.serviceIds.push(14);
  input.selected.time = '11:00';
  assert.deepEqual(snap.serviceIds,[12,13]);
  assert.equal(snap.time,'09:35');
});
test('v85: unchanged customer quote remains confirmable',()=> {
  const s = capture();
  assert.equal(isBookingConfirmationCurrent(s, base(), NOW + 60_000),true);
});
test('v85: quote is valid at age limit but not a millisecond after',()=> {
  const atLimit = capture({quoteReceivedAt: NOW-CONFIRMATION_QUOTE_MAX_AGE_MS});
  assert.ok(atLimit);
  assert.equal(isBookingConfirmationCurrent(atLimit,base(),NOW),false);
  assert.equal(isBookingConfirmationCurrent(atLimit,{...base(),quoteReceivedAt:NOW-CONFIRMATION_QUOTE_MAX_AGE_MS},NOW),true);
  assert.equal(isBookingConfirmationCurrent(atLimit,{...base(),quoteReceivedAt:NOW-CONFIRMATION_QUOTE_MAX_AGE_MS},NOW+1),false);
});
test('v85: new quote fetch invalidates old confirmation even if same amount',()=> {
  const s=capture();
  assert.equal(isBookingConfirmationCurrent(s,{...base(),quoteReceivedAt:NOW},NOW),false);
});
for (const [label, change] of [
  ['different barber',{barberId:22}],
  ['different service',{serviceIds:[12,14]}],
  ['services order changed',{serviceIds:[13,12]}],
  ['extra service',{serviceIds:[12,13,14]}],
  ['different day',{date:'2033-03-22'}],
  ['different start',{selected:{time:'09:40',endTime:'10:10',available:true}}],
  ['different end',{selected:{time:'09:35',endTime:'10:10',available:true}}],
  ['slot became busy',{selected:{time:'09:35',endTime:'10:05',available:false}}],
  ['price increased',{quote:'52000.00'}],
  ['price decreased',{quote:'50000.00'}],
  ['duration changed',{duration:35,selected:{time:'09:35',endTime:'10:10',available:true}}],
  ['policy cutoff changed',{policy:{cutoff_minutes:120,text:'Oldindan ogohlantiring'}}],
  ['policy text changed',{policy:{cutoff_minutes:60,text:'Boshqa qoida'}}],
  ['service label changed',{serviceName:'Soch turmaklash'}],
]) {
  test(`v85: ${label} requires reviewing quote again`,()=> {
    const s=capture();
    assert.ok(s);
    assert.equal(isBookingConfirmationCurrent(s,{...base(),...change},NOW),false);
  });
}
for (const [label, change] of [
  ['missing server quote',{quote:null}],
  ['zero quote',{quote:'0.00'}],
  ['fractional cents',{quote:'10.001'}],
  ['scientific notation',{quote:'1e4'}],
  ['negative quote',{quote:'-150'}],
  ['bogus duration',{duration:25}],
  ['wrong duration type',{duration:'30'}],
  ['missing policy',{policy:null}],
  ['negative cutoff',{policy:{cutoff_minutes:-1,text:'a'}}],
  ['too long cutoff',{policy:{cutoff_minutes:10081,text:null}}],
  ['too long terms',{policy:{cutoff_minutes:null,text:'a'.repeat(281)}}],
  ['duplicate service IDs',{serviceIds:[12,12]}],
  ['PG int4 overflow',{serviceIds:[2147483648]}],
  ['invalid ISO date',{date:'2033-02-29'}],
  ['missing server timestamp',{quoteReceivedAt:null}],
  ['timestamp from future',{quoteReceivedAt:NOW+1}],
  ['stale quote',{quoteReceivedAt:NOW-CONFIRMATION_QUOTE_MAX_AGE_MS-1}],
  ['occupied slot',{selected:{time:'09:35',endTime:'10:05',available:false}}],
  ['invalid slot grid',{selected:{time:'09:31',endTime:'10:01',available:true}}],
  ['slot ends next day',{selected:{time:'23:55',endTime:'00:25',available:true}}],
]) {
  test(`v85: ${label} cannot open valid confirmation`,()=>assert.equal(capture(change),null));
}
test('v85: end-of-day 24:00 is permitted only for slot end',()=> {
  const s=capture({selected:{time:'23:55',endTime:'24:00',available:true},duration:5});
  assert.ok(s);
  assert.equal(capture({selected:{time:'24:00',endTime:'24:05',available:true},duration:5}),null);
});
test('v85: no old confirmation after missing/invalid live state',()=> {
  const s=capture();
  assert.equal(isBookingConfirmationCurrent(s,{...base(),selected:null},NOW),false);
  assert.equal(isBookingConfirmationCurrent(null,base(),NOW),false);
});
