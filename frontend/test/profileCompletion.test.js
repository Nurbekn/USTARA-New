import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasProfileName, profileForSession } from '../src/pages/auth/profileCompletion.js';

test('signup API names complete both roles without a second name form', () => {
  for (const role of ['customer', 'barber']) {
    const session = { role, profile: { id: 5, first_name: 'Ali', last_name: 'Vali' } };
    const profile = profileForSession(session, {});
    assert.equal(hasProfileName(profile), true);
    assert.equal(profile.firstName, 'Ali');
    assert.equal(profile.lastName, 'Vali');
  }
  assert.equal(hasProfileName({ first_name: 'Ali', last_name: '' }), false);
  assert.equal(hasProfileName({ firstName: 'A'.repeat(81), lastName: 'Vali' }), false);
  assert.equal(hasProfileName({}), false);
  assert.equal(profileForSession({ role: 'barber', profile: {} }, { firstName: 'Usta', lastName: 'Vali' }).firstName, 'Usta');
});
