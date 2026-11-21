import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { networkNoticeStatus, networkNoticeCopy } from '../src/components/networkNoticeV163.js';
import { alternativeBarbersDiscoveryUrl } from '../src/pages/user/bookings/cancellationAlternatives.js';
import { siteLocalePath } from '../src/utils/siteLocale.js';

const cancelled = { id:12, status:'cancelled', customer_id:75, barber:{id:5}, services:[{id:7}] };
test('v163 offline and reconnect are distinct; reconnect never implies an API success', () => {
  assert.equal(networkNoticeStatus({online:false}), 'offline');
  assert.equal(networkNoticeStatus({online:true,previouslyOffline:true}), 'reconnected');
  assert.equal(networkNoticeStatus({online:true,previouslyOffline:true,dismissed:true}), 'hidden');
  assert.equal(networkNoticeStatus({online:true}), 'hidden');
  assert.equal(networkNoticeStatus({online:undefined}), 'hidden');
});
test('v163 offline copy is safe and available in all three site languages', () => {
  for (const lang of ['uz','ru','en']) {
    const copy = networkNoticeCopy(lang);
    assert.ok(copy.offline.length > 20 && copy.reconnected.length > 20);
    assert.ok(copy.dismiss);
  }
  assert.equal(networkNoticeCopy('invalid'),networkNoticeCopy('uz'));
});
test('v163 alternative barber discovery only for terminal cancelled/rejected, no private identifiers or service promises', () => {
  assert.equal(alternativeBarbersDiscoveryUrl(cancelled),'/user/explore?type=barbers');
  assert.equal(alternativeBarbersDiscoveryUrl({...cancelled,status:'rejected'}),'/user/explore?type=barbers');
  for (const status of ['confirmed','pending','completed',null])
    assert.equal(alternativeBarbersDiscoveryUrl({...cancelled,status}),null);
  assert.equal(alternativeBarbersDiscoveryUrl(null),null);
  const url=alternativeBarbersDiscoveryUrl(cancelled);
  assert.doesNotMatch(url,/12|75|5|7|token|phone/);
  assert.equal(siteLocalePath(url,'ru'),'/user/explore?type=barbers&lang=ru');
});
test('v163 global connection banner does not cache authenticated API, retry booking writes or auto-confirm actions', async () => {
  const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
  const notice=await readFile(new URL('../src/components/ConnectionNoticeV163.jsx',import.meta.url),'utf8');
  const transport=await readFile(new URL('../src/api/client.js',import.meta.url),'utf8');
  const jsx=await readFile(new URL('../src/pages/user/bookings/CancellationAlternatives.jsx',import.meta.url),'utf8');
  const bookings=await readFile(new URL('../src/pages/user/Bookings.jsx',import.meta.url),'utf8');
  assert.match(main,/<ConnectionNoticeV163 \/>/);
  assert.match(notice,/addEventListener\('offline'/);
  assert.match(notice,/addEventListener\('online'/);
  assert.doesNotMatch(notice,/(?:fetch\(|request\(|location\.reload\()/);
  assert.match(transport,/cache: "no-store"/);
  assert.match(jsx,/alternativeBarbersDiscoveryUrl\(booking\)/);
  assert.match(bookings,/alternativeBarbersDiscoveryUrl\(b\)/);
  assert.match(jsx,/siteLocalePath\(alternativeBarbersDiscoveryUrl\(booking\), lang\)/);
});
