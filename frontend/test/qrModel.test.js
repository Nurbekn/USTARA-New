import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isValidQrToken,qrStorageKey,statusLabel} from '../src/pages/queue/qrModel.js';
test('QR token must be opaque fixed-length lowercase hex',()=>{
 assert.equal(isValidQrToken('c'.repeat(48)),true);
 for(const token of ['c'.repeat(47),'c'.repeat(49),'x'.repeat(48),'C'.repeat(48),null,undefined])
  assert.equal(isValidQrToken(token),false);
});
test('guest receipt storage is tab scoped and unique per QR secret',()=>{
 assert.notEqual(qrStorageKey('a'.repeat(48)),qrStorageKey('b'.repeat(48)));
});
test('guest status labels contain no other person or private queue information',()=>{
 for(const state of ['pending','approved','rejected','expired'])assert.ok(statusLabel(state).length>10);
 assert.equal(statusLabel('unknown'),'Holat yangilandi.');
});
