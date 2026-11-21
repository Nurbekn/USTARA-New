import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barberOpsText, barberOpsWeekdays, barberOpsHasTranslation } from '../src/pages/barber/barberOpsLocaleV146.js';
import { readSiteLocale, siteLocalePath } from '../src/utils/siteLocale.js';
import { validateServiceDraft } from '../src/pages/barber/data/serviceForm.js';
import { calendarDates, validateCalendarHours } from '../src/pages/barber/data/calendarExceptions.js';
import { validateBreakRanges } from '../src/pages/barber/data/breakRules.js';
import { publicProfilePreview } from '../src/pages/barber/data/publicPreview.js';

const root = new URL('../src/pages/barber/', import.meta.url);
const files = [
 'Services.jsx','Portfolio.jsx','Schedule.jsx',
 'components/CalendarExceptionsEditor.jsx','components/RecurringBreaksEditor.jsx',
 'components/CancellationPolicyEditor.jsx','components/PublicProfilePreviewCard.jsx',
];
const source = (f) => readFileSync(new URL(f, root), 'utf8');
const localeSrc = source('barberOpsLocaleV146.js');

for (const lang of ['uz','ru','en']) {
 test(`v146 supports ${lang} without altering service names or user text`, () => {
  const tr = barberOpsText(lang);
  assert.equal(typeof tr('Xizmatlar'), 'string');
  assert.equal(tr('User-created: razor 24'), 'User-created: razor 24');
  assert.equal(tr('Custom caption 💈'), 'Custom caption 💈');
  assert.equal(tr('Datum {count}', {count:4}), 'Datum 4');
  assert.equal(tr(''), '');
 });
 test(`v146 locale ${lang}: weekdays remain 0-6 IDs`, () => {
  const days = barberOpsWeekdays(lang);
  assert.equal(days.length, 7);
  assert.ok(days.every(x => typeof x === 'string' && x.length > 3));
  assert.equal(new Set(days).size,7);
 });
}
test('v146 complete ru/en dictionary for every literal used in all 7 screens', () => {
 for (const path of files) {
  const raw = source(path);
  const keys = [...raw.matchAll(/\btr\(("(?:[^"\\]|\\.)*")/g)].map(m => JSON.parse(m[1]));
  assert.ok(keys.length >= 6, path);
  for (const key of keys) {
   assert.ok(barberOpsHasTranslation('ru',key),`ru ${path}: ${key}`);
   assert.ok(barberOpsHasTranslation('en',key),`en ${path}: ${key}`);
  }
 }
});
test('v146 fallback rejects prototype keys / unknown languages', () => {
 for(const lang of ['__proto__','constructor','toString',null,4,{},'EN']) {
  assert.equal(barberOpsText(lang)('Xizmatlar'),'Xizmatlar');
  assert.equal(barberOpsWeekdays(lang)[1],'Dushanba');
 }
 for(const url of ['?lang=ru&lang=en','?lang=__proto__','?lang[]=ru']) {
  assert.equal(readSiteLocale(url),'uz');
 }
 assert.equal(barberOpsHasTranslation('__proto__','Xizmatlar'),false);
 assert.equal(barberOpsHasTranslation('en','__proto__'),false);
});
test('v146 variable interpolation uses own keys only, not inherited prototype', () => {
 const tr = barberOpsText('en');
 assert.equal(tr('{count} kun saqlandi.',{count:3}), 'Days saved: 3.');
 assert.equal(tr('{count} kun saqlandi.', Object.create({count:999})),'Days saved: {count}.');
 assert.equal(tr('{date} uchun istisno olib tashlandi.', {date:'2026-12-01'}), 'Exception for 2026-12-01 removed.');
});
test('v146 service UI localizes text while keeping numeric API price/status contract', () => {
 const raw=source('Services.jsx');
 for(const invariant of [
 'duration_minutes: validation.duration', 'is_active: form.active',
 '`/api/services/${form.id}`', '"/api/services"',
 '`/api/services/${id}/status`', 'service_has_bookings', 'refreshBarberData()',
 'maxLength={50}', 'maxLength={8}', 'stepServicePrice(form.price, -5000)',
 ]) assert.ok(raw.includes(invariant),invariant);
 assert.match(raw,/const tr = barberOpsText\(lang\)/);
 assert.ok(barberOpsText('ru')('Xizmatni tahrirlash').includes('услуг'));
});
test('v146 service validation remains 5-minute/price oriented', () => {
 assert.equal(validateServiceDraft({name:'Test',price:'10000',duration:15}).ok,true);
 assert.equal(validateServiceDraft({name:'Test',price:'10000',duration:13}).ok,false);
});
test('v146 portfolio retains media limits, publish/delete and safe new-tab owner links', () => {
 const raw=source('Portfolio.jsx');
 for(const key of ['MAX_FILE = 25 * 1024 * 1024','MAX_VIDEO = 50 * 1024 * 1024',
 'publishPortfolioPost({', 'deletePortfolioPost(viewing)', 'onClick={publish}',
 'selectionRef.current', 'URL.revokeObjectURL(previewRef.current)',
 'siteLocalePath("/barber/profile", lang)']) assert.ok(raw.includes(key),key);
 assert.match(raw, /readSiteLocale\(useLocation\(\).search\)/);
});
test('v146 schedule preserves acceptance and hours API boundaries', () => {
 const raw=source('Schedule.jsx');
 for(const key of ['setBookingAcceptance(acceptingBookings)', 'saveWorkingHours(draft)',
 'aria-checked={profile.acceptingBookings === true}', 'setDraftState({ hours: profile.hours, source: profile.hours })',
 'status !== "ready"', 'profile.acceptingBookings']) assert.ok(raw.includes(key),key);
});
test('v146 date exceptions retain exact validation, time step and session request',()=>{
 const raw=source('components/CalendarExceptionsEditor.jsx');
 for(const x of ['calendarDates(day,mode===\'vacation\'?vacationEnd:day)',
 'validateCalendarHours({start,end,breakEnabled,breakStart,breakEnd})',
 "'/api/barbers/calendar-exceptions'", 'step="300"', 'toISODate()']) assert.ok(raw.includes(x),x);
 assert.equal(calendarDates('2026-12-03','2026-12-04').length,2);
 assert.equal(validateCalendarHours({start:'09:00',end:'18:00',breakEnabled:false}).is_closed,false);
});
test('v146 recurring breaks retain max 8 and numeric day-of-week',()=>{
 const raw=source('components/RecurringBreaksEditor.jsx');
 for(const x of ['value.length>=8', "'weekly'", "'dated'", 'day_of_week:weekday',
 'step="300"', 'validateBreakRanges', 'barberOpsWeekdays(lang)',
 'value={i}', 'displayDays[x.day_of_week]', 'tr={tr}']) assert.ok(raw.includes(x),x);
 assert.equal(validateBreakRanges([{start:'13:00',end:'14:00'}]).length,1);
});
test('v146 cancellation cutoff still uses original semantic values and constraints',()=>{
 const raw=source('components/CancellationPolicyEditor.jsx');
 for(const x of ["{ value: 'none'", "{ value: '1440'", "{ value: '2880'",
 'cutoff_minutes: numeric', 'note.trim().length > 280', 'numeric > 10080',
 "'/api/barbers/cancellation-policy'", 'tr(preset.label)']) assert.ok(raw.includes(x),x);
});
test('v146 public preview translates existing safety checks without modifying their model',()=>{
 const raw=source('components/PublicProfilePreviewCard.jsx');
 for(const x of ['publicProfilePreview(profile, { session: getSession()',
 'view.canOpen && <PublicProfileShare', 'siteLocalePath(view.url, lang)',
 'siteLocalePath(item.to, lang)','tr(item.label)', 'tr(view.message)',
 'rel="noopener noreferrer"', 'target="_blank"']) assert.ok(raw.includes(x),x);
 const p={id:41,firstName:'Ali',verification_status:'approved',about:'Ok',address:'Tashkent',services:[],hours:[]};
 const s={role:'barber',token:'a-token',profileId:41};
 assert.equal(publicProfilePreview(p,{session:s,status:'ready'}).canOpen,true);
 assert.equal(publicProfilePreview({...p,verification_status:'pending'},{session:s,status:'ready'}).canOpen,false);
 assert.equal(siteLocalePath('/barbers/41','ru'),'/barbers/41?lang=ru');
});
test('v146 language never changes backend / auth roles / migration identifier',()=>{
 for(const p of files) {
  const raw=source(p);
  assert.ok(!raw.includes('lang:session') && !raw.includes('body: { lang'),p);
  assert.ok(!raw.includes('localStorage.setItem("token"'),p);
 }
 assert.match(localeSrc,/API values/);
});
