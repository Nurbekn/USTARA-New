import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readSiteLocale,siteLocalePath,siteLocaleSwitchUrl} from '../src/utils/siteLocale.js';
import {barberInsightsText,barberInsightsDate,hasBarberInsightsTranslation} from '../src/pages/barber/barberInsightsLocaleV147.js';
const root=new URL('../src/pages/barber/',import.meta.url);
const source=name=>readFileSync(new URL(name,root),'utf8');
const t=(lang,key,vars)=>barberInsightsText(lang)(key,vars);

// Literal language and interpolation coverage; API semantics remain unmodified.
test('v147 defaults to Uzbek and refuses inherited properties as lookup keys',()=>{
 assert.equal(t('uz','Bugungi daromad'), 'Bugungi daromad');
 assert.equal(t('ru','__proto__'),'__proto__');
 assert.equal(t('en','constructor'),'constructor');
 assert.equal(t('xx','Bugungi daromad'),'Bugungi daromad');
});
test('v147 supports only configured languages',()=>{
 for(const [q,want] of [['?lang=uz','uz'],['?lang=ru','ru'],['?lang=en','en'],['?lang=ru&lang=en','uz'],['?lang=constructor','uz']]) assert.equal(readSiteLocale(q),want);
});
test('v147 UI source strings never become API booking status identifiers',()=>{
 for(const key of ['Kutilmoqda','Tasdiqlangan','Bekor qilingan','Bajarilgan']) assert.equal(t('uz',key),key);
 assert.equal(t('ru','Kutilmoqda'),'Ожидает');
});
const translations=[
 ['Bugungi daromad','Доход за сегодня',"Today's earnings"],
 ['Kunlik daromad','Доход по дням','Daily earnings'],
 ['Hisobot davri','Период отчёта','Report period'],
 ['Xizmatlar bo‘yicha','По услугам','By service'],
 ['Sharhlar','Отзывы','Reviews'],
 ['Mijozlar bahosi','Оценка клиентов','Customer rating'],
 ['Javob yozish','Ответить','Write a reply'],
 ['Bronlar','Записи','Bookings'],
 ['Tarix','История','History'],
 ['Qabul qilish','Принять','Accept'],
 ['Bronni bekor qilasizmi?','Отменить запись?','Cancel this booking?'],
 ['Mehmonni navbatga qo‘shish','Добавить гостя в очередь','Add a walk-in customer'],
 ['QR orqali navbatga so‘rov','Запрос в очередь по QR','QR queue requests'],
 ['Keyingisini chaqirish (FIFO)','Вызвать следующего (FIFO)','Call next (FIFO)'],
 ['Ish kunini xavfsiz yakunlash','Безопасное закрытие дня','Safe day closure'],
 ['Hozirgi navbat','Текущая очередь','Current queue'],
 ['Navbatdan chiqarish','Удалить из очереди','Remove from queue'],
 ['Tasdiqlash','Подтвердить','Approve'],
 ['Kutayotgan mijozlar','Ожидающие клиенты','Waiting customers'],
 ['Oldingi kundan qolgan ochiq navbatlar','Незавершённые очереди прошлых дней','Unresolved entries from previous days'],
 ['Navbat holati tasdiqlanmagan. Barcha amallar vaqtincha bloklangan. Yangilang.','Статус очереди не подтверждён. Все действия временно заблокированы. Обновите.','Queue state is unverified. All actions are temporarily blocked. Refresh.'],
];
for(const [uz,ru,en] of translations)test(`v147 i18n ${uz}`,()=>{
 assert.equal(hasBarberInsightsTranslation('ru',uz),true);
 assert.equal(hasBarberInsightsTranslation('en',uz),true);
 assert.equal(t('ru',uz),ru);assert.equal(t('en',uz),en);
});
test('v147 interpolation escapes no user text and changes no IDs',()=>{
 assert.equal(t('en','Bron #{id} tasdiqlandi',{id:591}),'Booking #591 confirmed');
 assert.equal(t('ru','O‘rtacha: {price}',{price:'12 345 so\'m'}),"Среднее: 12 345 so'm");
 assert.equal(t('en','Oxirgi {count} kun',{count:30}),'Last 30 days');
});
test('v147 does not interpolate inherited properties or mutate originals',()=>{
 const values=Object.create({count:666});
 assert.equal(t('en','Oxirgi {count} kun',values),'Last {count} days');
 assert.equal(t('uz','Oxirgi {count} kun',{count:7}),'Oxirgi 7 kun');
});
for(const [lang,expected] of [['ru','Сегодня'],['en','Today']])test(`v147 localized dates ${lang}`,()=>{
 assert.equal(barberInsightsDate('2026-11-20',lang,new Date(2026,10,20)),expected);
 assert.equal(barberInsightsDate('2026-11-21',lang,new Date(2026,10,20)),lang==='ru'?'Завтра':'Tomorrow');
});
test('v147 malformed dates are not converted to a plausible looking calendar date',()=>{
 for(const d of ['2026-13-40','2026-02-30','secret','']) assert.equal(barberInsightsDate(d,'en'),d);
 assert.equal(barberInsightsDate('2026-11-20','uz'),null);
});
test('v147 localized Dashboard preserves price source and approved route links',()=>{
 const s=source('Dashboard.jsx');
 for(const key of ['booking.price','STATUS.COMPLETED','getRatingSummary(reviews)','bookingStart(b) >= now','formatMoney(earnedToday)','siteLocalePath(\'/barber/earnings\',lang)'])assert.ok(s.includes(key),key);
 assert.match(s,/tr\("Bugungi daromad"\)/);
});
test('v147 Earnings does not change snapshots, grouping or totals',()=>{
 const s=source('Earnings.jsx');for(const k of ['earningsSeries(state.rows, days','/api/barbers/earnings','booking_snapshot','mixed_snapshot_and_current_price','state.rows.filter(row => row.day >= series[0].date)']) assert.ok(s.includes(k),k);
});
test('v147 Reviews retain 200-character limit, reply validation and stable rating numbers',()=>{
 const s=source('Reviews.jsx');for(const k of ['maxLength={200}','replyToReview(reviewId, text)','!text.trim()','r.rating === 5','r.rating <= 3'])assert.ok(s.includes(k),k);
});
test('v147 Bookings retain pending/confirmed/history status codes and paging',()=>{
 const s=source('Bookings.jsx');for(const k of ['const PAGE_SIZE = 30','STATUS.COMPLETED','STATUS.REJECTED','STATUS.CANCELLED','setVisible(visible + PAGE_SIZE)','role="tab"'])assert.ok(s.includes(k),k);
});
test('v147 BookingCard confirms irreversible transitions before POST',()=>{
 const s=source('components/BookingCard.jsx');for(const k of ['NEEDS_CONFIRM[status] ? setAsking(status) : apply(status)','setBookingStatus(booking.id, status)','booking.bookingTime ? new Date(booking.bookingTime)','tr(NEEDS_CONFIRM[asking])'])assert.ok(s.includes(k),k);
});
test('v147 Queue keeps FIFO, revision and latest-request checks',()=>{
 const s=source('Queue.jsx');for(const k of ['callNextIntent(called,waiting)','finishIntent(entry,status)','readGate.current.isLatest(requestId)','actionLock.current','queue_result_unknown','expected_order:order','sameDayAction(proposed.intent,getSession(),sessionEpoch)'])assert.ok(s.includes(k),k);
});
test('v147 Queue still verifies no-show, service finish and day close confirmation',()=>{
 const s=source('Queue.jsx');for(const k of ['confirmNoShow(noShowConfirmation','confirmServiceFinish(finishConfirmation','parseDayCloseReadiness(data)','dayCloseIntent(dayClose,','dayReopenIntent(dayClose,','Tasdiq 30 soniya amal qiladi.'])assert.ok(s.includes(k),k);
});
test('v147 Queue keeps original 15s refresh and one-time guest claim semantics',()=>{
 const s=source('Queue.jsx');for(const k of ['},15000)','/api/queue/walk-ins/','/claim-code','/api/queue/qr-tokens','/api/queue/qr-pending/'])assert.ok(s.includes(k),k);
});
test('v147 no private URL parameters in language-only links',()=>{
 const url=siteLocaleSwitchUrl({pathname:'/barber/queue',search:'?token=secret&otp=12345&lang=uz'},'ru');
 assert.equal(url,'/barber/queue?lang=ru');
 assert.equal(siteLocalePath('/barber/earnings','en'),'/barber/earnings?lang=en');
});
test('v147 AvailabilityBadge remains server-driven, not text-driven',()=>{
 const s=source('components/AvailabilityBadge.jsx');for(const k of ["profile.verification_status === 'approved'",'getAvailability(profile, now)','profile.acceptingBookings == null',"open ? 'is-open' : 'is-closed'"])assert.ok(s.includes(k),k);
});
