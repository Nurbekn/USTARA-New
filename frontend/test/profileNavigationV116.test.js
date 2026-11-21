import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { publicProfileTab, publicProfileTabLink, publicPostAriaLabel, PUBLIC_PROFILE_TABS } from '../src/pages/user/barber/profileNavigation.js';

test('v116 / four real profile tabs are supported', () => {
  assert.deepEqual(PUBLIC_PROFILE_TABS, ['posts', 'services', 'hours', 'reviews']);
  for (const id of PUBLIC_PROFILE_TABS) assert.equal(publicProfileTab(`?tab=${id}`), id);
});
test('v116 / first profile view defaults to booking services for #42', () => {
  assert.equal(publicProfileTab(''), 'services');
  assert.equal(publicProfileTab('?other=value'), 'services');
});
test('v116 / unsupported or hostile tab query does not become a valid tab', () => {
  for (const value of ['invalid', 'javascript:alert(1)', '<img>']) {
    assert.equal(publicProfileTab(`?tab=${encodeURIComponent(value)}`), 'services');
    assert.throws(() => publicProfileTabLink('', value), RangeError);
  }
});
test('v116 / booking shortcut preserves existing services draft link', () => {
  const link = publicProfileTabLink('?services=12%2C45&tab=posts', 'services');
  assert.equal(link.hash, '#bpv-content');
  assert.equal(publicProfileTab(link.search), 'services');
  assert.equal(new URLSearchParams(link.search).get('services'), '12,45');
});
test('v116 / tab back/forward routes can be bookmarked without dropping unrelated query', () => {
  const from = publicProfileTabLink('?area=Yunusobod&services=7', 'reviews');
  const next = publicProfileTabLink(from.search, 'posts');
  const params = new URLSearchParams(next.search);
  assert.equal(params.get('area'), 'Yunusobod');
  assert.equal(params.get('services'), '7');
  assert.equal(params.getAll('tab').length, 1);
  assert.equal(params.get('tab'), 'posts');
});
test('v116 / post and video accessible labels respect concise caption', () => {
  assert.equal(publicPostAriaLabel({ media: [{ type: 'video' }], caption: 'Yangi  uslub' }), 'Videoni ochish: Yangi uslub');
  assert.equal(publicPostAriaLabel({ media: [], caption: '' }), 'Postni ochish');
  assert.ok(publicPostAriaLabel({ caption: 'x'.repeat(400) }).length <= 96);
});
test('v116 / public header CTA and tabs use bookmarkable URL navigation', async () => {
  const source = await readFile(fileURLToPath(new URL('../src/pages/user/barber/BarberPublicProfile.jsx', import.meta.url)), 'utf8');
  assert.match(source, /publicProfileTab\(location\.search\)/);
  assert.match(source, /navigate\(publicProfileTabLink\(location\.search, nextTab\)/);
  assert.match(source, /className="bpv-booking-jump" to=\{bookingLink\}/);
  assert.match(source, /details\.services\.length > 0/);
  assert.match(source, /ui\.bookingHint/);
  const locale = await readFile(fileURLToPath(new URL('../src/pages/user/barber/publicProfileLocale.js', import.meta.url)), 'utf8');
  assert.match(locale, /Bron avtomatik yaratilmaydi/);
});
test('v116 / catalogue booking shortcut retains route back context', async () => {
  const source = await readFile(fileURLToPath(new URL('../src/pages/user/explore/ResultCard.jsx', import.meta.url)), 'utf8');
  assert.match(source, /siteLocalePath\(`\$\{profileUrl\.split\(\"\?\"\)\[0\]\}\?\$\{bookingQuery\}`, lang\)/);
  assert.match(source, /state=\{\{ from: location\.pathname \+ location\.search \}\}/);
  assert.match(source, /siteLocalePath/);
  assert.match(source, /bookingProfileQuery\(selectedServiceId, services\)/);
});
