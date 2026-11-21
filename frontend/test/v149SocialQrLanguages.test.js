import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {socialQueueText,hasSocialQueueTranslation,localizeQueueWait} from '../src/pages/user/social/socialQueueLocaleV149.js';
import {formatWait,statusLabel,isValidQrToken,qrStorageKey} from '../src/pages/queue/qrModel.js';
import {siteLocaleSwitchUrl,siteLocalePath,readSiteLocale} from '../src/utils/siteLocale.js';
import {parsePublicQueueSummary} from '../src/pages/user/barber/publicQueueModel.js';
const src = path => readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
const required = [
  'Rasm yoki video tanlang.',
  'Jami 6 tagacha rasm tanlash mumkin. Oldingi rasmlar saqlanib turibdi.',
  'Before / After uchun aynan ikkita rasm kerak.',
  'Post joylanmadi. Qoralama saqlanib turibdi.',
  'Gemini yordamida tavsif',
  'O‘zingiz bajargan ishni bir-ikki gapda yozing. AI faqat matn yaratadi, postni o‘zi joylamaydi.',
  'Post faqat server tasdiqlagandan keyin lentada ko‘rinadi. Oyna yopilsa qoralama tozalanadi.',
  'Kuzatish', 'Post haqida shikoyat', 'Izohlar',
  'Saqlanganlardan olib tashlash', 'Barber profili va xizmatlari',
  'Media mavjud emas', 'Media qo‘shilmagan',
  'Navbatga QR orqali kirish','QR havola noto‘g‘ri.',
  'Sartaroshga so‘rov yuborish', 'Navbatdagi o‘rningiz:',
  'Taklif 5 daqiqa amal qiladi. Qabul qilgach, 2 daqiqa ichida mijoz akkauntingizdan mos xizmatni tanlab haqiqiy bronni tasdiqlang.',
  'Taklif qabul qilindi, lekin vaqt hali band qilinmagan.',
  'Haqiqiy bronni tasdiqlash',
  'Faqat o‘zingiz ulagan Telegram chatga navbatingiz kelganda xabar yuboramiz. Telefon raqami so‘ralmaydi.',
  'Navbatdan chiqilsa, o‘rningiz va hali tasdiqlanmagan Smart Booking taklifingiz bekor bo‘ladi. Tasdiqlangan bronlar saqlanadi.',
  'Jonli walk-in navbat',
  'Bu bron vaqti emas. Taxminiy kutish oldindan tasdiqlangan bronlarni to‘liq hisobga olmaydi; sahifa ochiq turganda 30 soniyada yangilanadi.',
];
for (const lang of ['ru','en']) {
  for (const key of required) {
    test(`v149 ${lang}: ${key.slice(0,62)}`, () => {
      const translated = socialQueueText(lang)(key);
      assert.ok(hasSocialQueueTranslation(lang,key));
      assert.ok(translated.length > 1);
      assert.notEqual(translated,key);
      assert.doesNotMatch(translated,/[\u0000-\u001f]/);
    });
  }
}
test('v149 original UZ copy and fallbacks are safe for exotic object keys',()=>{
  const uz = socialQueueText('uz');
  assert.equal(uz('Rasm yoki video tanlang.'),'Rasm yoki video tanlang.');
  for (const lang of ['__proto__','constructor','Ru',null,undefined,{},42]) assert.equal(socialQueueText(lang)('Kuzatish'),'Kuzatish');
  for (const key of ['__proto__','constructor','toString','hasOwnProperty']) {
    assert.equal(socialQueueText('ru')(key),key);
    assert.equal(hasSocialQueueTranslation('en',key),false);
  }
  assert.equal(socialQueueText('en')(null),'');
  assert.equal(socialQueueText('en')({toString:()=>'<script>'}),'');
  assert.equal(hasSocialQueueTranslation('ru',null),false);
});
test('v149 status identifiers and QR token never translated',()=>{
  assert.equal(statusLabel('approved','called'),'Sizni chaqirishdi! Sartarosh yoniga boring.');
  assert.equal(socialQueueText('en')(statusLabel('approved','called')),'You have been called. See the barber.');
  assert.equal(socialQueueText('ru')(statusLabel('rejected')),'Барбер отклонил запрос.');
  for (const code of ['pending','approved','accepted','waiting','in_service','confirmed']) {
    assert.equal(socialQueueText('en')(code),code);
    assert.equal(socialQueueText('ru')(code),code);
  }
  const token='a'.repeat(48);
  assert.equal(isValidQrToken(token),true);
  assert.equal(qrStorageKey(token),`ustara:qr:v22:${token}`);
});
test('v149 numeric ETA stays model validated and localizes only recognized wait strings',()=>{
  const eta={min_minutes:15,max_minutes:25,approximate:true};
  const formatted=formatWait(eta);
  assert.equal(formatted,'15–25 daqiqa (taxminiy)');
  assert.equal(localizeQueueWait(formatted,'uz'),formatted);
  assert.equal(localizeQueueWait(formatted,'ru'),'15–25 мин (примерно)');
  assert.equal(localizeQueueWait(formatted,'en'),'15–25 min (estimated)');
  for(const str of ['15 min (estimated)','-10–20 daqiqa (taxminiy)','1–2 days','15–25 daqiqa (taxminiy) <script>','constructor',null,{}]) assert.equal(localizeQueueWait(str,'en'),null);
  assert.equal(formatWait({min_minutes:-5,max_minutes:10}),null);
});
test('v149 composer preserves media quotas, payload shape, AI opt-in and abort controls',()=>{
  const s=src('pages/user/social/Composer.jsx');
  for(const key of ['maxLength={2000}','maxLength={600}','combined.length > 6','(isVideoFile(f) ? 100 : 25) * 1024 * 1024','kind === "beforeAfter"','media.length !== 2','previewErrors[m.url]','URL.revokeObjectURL','pending.current?.abort()','files: media.map((m) => m.file)','caption: caption.trim()','serviceId: serviceId || null','onPublished(post)','suggestSocialCaption({ description: aiPrompt.trim() })']) assert.ok(s.includes(key),key);
  assert.match(s,/tr\("Gemini yordamida tavsif"\)/);
  assert.match(s,/lang = "uz"/);
});
test('v149 social feed cards keep user actions and localized safe internal links',()=>{
  const s=src('pages/user/social/PostCard.jsx');
  for(const key of ['onClick={onLike}','onClick={onFollow}','onClick={onSave}','onClick={onReport}','onClick={onShare}','disabled={!mutationsAvailable}','aria-pressed={liked}','aria-pressed={saved}','siteLocalePath(profile,lang)','siteLocalePath(`/user/explore?type=services&q=${encodeURIComponent(s.name)}`,lang)','lang={lang}']) assert.ok(s.includes(key),key);
  assert.doesNotMatch(s,/window\.open\(/);
});
test('v149 media gallery preserves safe server resolution, disabled lightbox and failed preview',()=>{
  const s=src('pages/user/social/MediaGallery.jsx');
  for(const key of ['resolveMediaUrl(item.url)','disabled={!onOpen}','onError={() => setFailed','initialIndex','controls playsInline preload={i === index ? "metadata" : "none"}','tr("Media mavjud emas")']) assert.ok(s.includes(key),key);
});
test('v149 QR enrollment preserves server authorization, one-use token & polling gates',()=>{
  const s=src('pages/queue/QueueCheckIn.jsx');
  for(const key of ["isValidQrToken(token)","statusGate.current.isLatest(epoch)","parseQrQueueStatus(data)","statusGate.current.invalidate()","/api/queue/qr-requests","/api/queue/qr-status","/api/queue/qr-leave","},15000)","label:label.trim()||'Mehmon'","sessionStorage.getItem(qrStorageKey(token))","getSession()?.token!==authToken","canSelfExitQueue(ticket?.queue_status)"]) assert.ok(s.includes(key),key);
  assert.match(s,/<SiteLanguageSelect \/>/);
  assert.match(s,/readSiteLocale\(useLocation\(\)\.search\)/);
});
test('v149 Smart Booking limits and consent actions still require exact state checks',()=>{
  const s=src('pages/queue/QueueCheckIn.jsx');
  for(const key of ["result.code||tr('Taklif muddati tugagan.')",'!bundle.valid','selectedServiceIds.length>=20','expected_total_price:bundle.totalPrice','offerClock>=new Date(ticket.smart_offer.expires_at).getTime()','offerClock>=new Date(ticket.smart_offer.confirmation_deadline).getTime()','offerDecision(\'accept\')','offerDecision(\'reject\')','offerDecision(\'cancel\')',"action==='join'?'/api/queue/telegram/opt-in'", "'/api/queue/telegram/opt-out'","/api/queue/telegram/offer-consent"]) assert.ok(s.includes(key),key);
  assert.match(s,/5 daqiqa amal qiladi/);
  assert.match(s,/2 daqiqa ichida/);
});
test('v149 public queue does not leak ticket data or claim accurate booking times',()=>{
  const now=Date.parse('2026-11-20T12:00:00.000Z');
  const obj={barber_id:7,waiting_count:3,currently_called:false,day_closed:false,as_of:'2026-11-20T12:00:00.000Z',new_arrival_estimate:{min_minutes:10,max_minutes:15,approximate:true},phone:'+998900000000',token:'secret'};
  const safe=parsePublicQueueSummary(obj,7,now);
  assert.equal(safe.waiting_count,3);
  assert.equal(safe.new_arrival_estimate.max_minutes,15);
  assert.equal(Object.hasOwn(safe,'phone'),false);
  assert.equal(Object.hasOwn(safe,'token'),false);
  assert.equal(parsePublicQueueSummary(obj,8,now),null);
  assert.equal(parsePublicQueueSummary(obj,7,now+100000),null);
  const s=src('pages/user/barber/PublicQueueSummary.jsx');
  for(const key of ['parsePublicQueueSummary','createPublicQueueRequestRunner','},30000)','document.visibilityState','runner.stop()','localizeQueueWait(formatWait(summary.new_arrival_estimate),lang)','tr("Bu bron vaqti emas.']) assert.ok(s.includes(key),key);
  assert.match(src('pages/user/barber/BarberPublicProfile.jsx'),/<PublicQueueSummary barberId=\{barber\.id\} lang=\{lang\} \/>/);
});
test('v149 changing QR language preserves path but drops injected secrets and unknown params',()=>{
  const token='e'.repeat(48);
  const path=`/queue/check-in/${token}`;
  assert.equal(siteLocaleSwitchUrl({pathname:path,search:'?password=hidden&otp=12345&lang=uz&foo=1'},'en'),`${path}?lang=en`);
  assert.equal(siteLocaleSwitchUrl({pathname:path,search:'?reset_token=bad&lang=en'},'ru'),`${path}?lang=ru`);
  assert.equal(siteLocalePath('/login','ru'),'/login?lang=ru');
  assert.equal(readSiteLocale('?lang=en&lang=ru'),'uz');
});
test('v149 pages pass UZ/RU/EN language through actual components',()=>{
  const s=src('pages/user/Social.jsx');
  for(const part of ['lang={lang}','const detailTr = socialQueueText(lang)','hasCustomerActivityTranslation(lang,source)','role={role}','publish={publishPost}']) assert.ok(s.includes(part),part);
  assert.match(src('pages/user/social/PostCard.jsx'),/title=\{tr\("Post"\)\}/);
  assert.match(src('pages/queue/QueueCheckIn.jsx'),/siteLocalePath\("\/login",lang\)/);
});
