import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../src/', import.meta.url);
const load = path => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');
test('v137 — public help route is available without login',()=> {
  const app = load('App.jsx');
  const publicGroup = app.indexOf('<Route element={<MainLayout />}');
  const secureGroup = app.indexOf('<Route element={<RequireSession role="customer" />}');
  const help = app.indexOf('<Route path="/help" element={<HelpCenter />} />');
  assert.ok(publicGroup >= 0 && help > publicGroup && help < secureGroup);
});
test('v137 — original five customer navigation destinations remain unchanged',()=> {
  const ui=load('layouts/UserLayout.jsx');
  for(const item of ['/user", label: "Asosiy"', '/user/explore?type=barbers", label: "Sartaroshlar"', '/user/social", label: "Ilhom"', '/user/bookings", label: "Bronlar"', '/user/profile", label: "Profil"']) assert.ok(ui.includes(item));
  assert.match(ui,/siteLocalePath\("\/help", lang\)/);
});
test('v137 — guest, customer, barber and contextual links are wired',()=> {
  assert.match(load('components/Navbar.jsx'),/siteLocalePath\("\/help", lang\)/);
  assert.match(load('layouts/BarberLayout.jsx'),/siteLocalePath\("\/help\?category=barber", lang\)/);
  assert.match(load('pages/user/Explore.jsx'),/siteLocalePath\("\/help\?topic=search", lang\)/);
  assert.match(load('pages/user/Bookings.jsx'),/siteLocalePath\("\/help\?topic=bookings", lang\)/);
  assert.match(load('pages/user/barber/BarberPublicProfile.jsx'),/siteLocalePath\("\/help\?topic=booking", lang\)/);
});
test('v137 — support is a pure info page and does not post credentials or auto-submit',()=> {
  const ui=load('pages/help/HelpCenter.jsx');
  assert.doesNotMatch(ui,/fetch\(|localStorage\.|sessionStorage\.|\.post\(|request\(/);
  assert.match(ui,/aria-live="polite"/);
  assert.match(ui,/aria-pressed=/);
  assert.match(ui,/aria-expanded=/);
});
