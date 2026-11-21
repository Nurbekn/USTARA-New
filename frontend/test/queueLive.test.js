import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatWait,isActiveTicket,statusLabel} from '../src/pages/queue/qrModel.js';
test('QR guest sees a range, not a precise promised appointment',()=>{
 assert.equal(formatWait({min_minutes:15,max_minutes:50}),'15–50 daqiqa (taxminiy)');
 for (const invalid of [null,{}, {min_minutes:-5,max_minutes:3},{min_minutes:20,max_minutes:5}])
  assert.equal(formatWait(invalid),null);
});
test('only pending/waiting/called QR requests keep polling',()=>{
 assert.equal(isActiveTicket('pending'),true);
 assert.equal(isActiveTicket('approved','waiting'),true);
 assert.equal(isActiveTicket('approved','called'),true);
 for (const state of ['served','missed','left'])assert.equal(isActiveTicket('approved',state),false);
 assert.equal(isActiveTicket('rejected'),false);
 assert.equal(isActiveTicket('expired'),false);
});
test('called and finished ticket status is understandable in Uzbek',()=>{
 assert.match(statusLabel('approved','called'),/chaqirishdi/i);
 assert.match(statusLabel('approved','served'),/yakunlandi/i);
 assert.match(statusLabel('approved','waiting'),/kutilmoqda/i);
 assert.match(statusLabel('pending'),/tasdiqlashini/);
});
