import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSetupHours, setupHoursFromServer, createBarberSetupApi } from '../src/pages/barber/data/setup.js';
const current = { role: 'barber', accountId: 42, profileId: 7, token: 'test', setupDone: false };
test('boshlang‘ich jadvalda faqat yakshanba dam olish', () => {
  const hours = defaultSetupHours();
  assert.deepEqual(hours.filter(h => h.isOff).map(h => h.day), [0]);
  assert.equal(hours.filter(h => !h.isOff).length, 6);
  assert.ok(hours.every(h => h.start === '09:00' && h.end === '18:00'));
  assert.deepEqual(setupHoursFromServer([]), hours);
});
test('avval saqlangan jadval o‘z holicha yuklanadi', () => {
  const hours = setupHoursFromServer([{ day_of_week: 3, start_time: '11:30:00', end_time: '17:00:00' }]);
  assert.deepEqual(hours.filter(h => !h.isOff), [{ day: 3, start: '11:30', end: '17:00', isOff: false }]);
});
test('setup faqat profil va jadvalga so‘rov qiladi, dashboard holatiga bog‘lanmaydi', async () => {
  const calls = [];
  const api = createBarberSetupApi({ getSession: () => current, setSession: () => assert.fail(), request: async (method, path) => { calls.push([method, path]);return path.endsWith('/me') ? { barber: { id: 7, address: 'Toshkent' } } : []; } });
  const result = await api.load();assert.equal(result.address, 'Toshkent');assert.equal(result.hours.filter(h => !h.isOff).length, 6);
  assert.deepEqual(calls, [['GET', '/api/barbers/me'], ['GET', '/api/barbers/working-hours']]);
});
test('server saqlashni tasdiqlagach setupDone belgilanadi va pending sahifa tanlanadi', async () => {
  const calls = [], sessions = [];
  const api = createBarberSetupApi({ getSession: () => current, setSession: s => sessions.push(s), request: async (...args) => { calls.push(args);assert.equal(sessions.length, 0);return { barber: { id: 7, verification_status: 'pending' }, working_hours: defaultSetupHours().filter(h => !h.isOff).map(h => ({ day_of_week: h.day, start_time: h.start + ':00', end_time: h.end + ':00' })) }; } });
  assert.equal(await api.save({ address: '', location: null, hours: defaultSetupHours() }), '/barber/pending');
  assert.equal(sessions[0].setupDone, true);assert.equal(sessions[0].token, current.token);
  assert.equal(calls[0][1], '/api/barbers/setup');assert.deepEqual(calls[0][2].body.working_hours.map(h => h.day_of_week), [1, 2, 3, 4, 5, 6]);
});
test('saqlash xatosida sessiya va setupDone o‘zgarmaydi', async () => {
  const api = createBarberSetupApi({ getSession: () => current, setSession: () => assert.fail(), request: async () => { throw Error('server'); } });
  await assert.rejects(api.save({ hours: defaultSetupHours() }), /server/);
});
test('boshqa profil javobi yoki yangi login eski so‘rovni yakunlamaydi', async () => {
  const api = createBarberSetupApi({ getSession: () => current, setSession: () => assert.fail(), request: async () => ({ barber: { id: 8, verification_status: 'pending' }, working_hours: [] }) });
  await assert.rejects(api.save({ hours: defaultSetupHours() }), /tasdiqlamadi/);
});
