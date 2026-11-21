# USTARA v113 — dependency preflight va kalendar tranzaksiya himoyasi

## Manba va maqsad

v112 to‘liq ZIP bazasi. #153 Safe Day Closing atrofi: kalendar va tanaffus yozuvlaridagi PostgreSQL ulanish xatolari, kiritilgan vaqtlar aniqligi va sinov paketlarining yetishmasligini **aniq** qayd qilish.

## O‘zgartirishlar

1. `calendarExceptionsController.validateException` endi barcha ish va tanaffus vaqtlarini qat’iy `HH:MM` va 5 daqiqalik qadamda tekshiradi.
2. Frontend `validateCalendarHours` aynan shu 5 daqiqalik qoida bo‘yicha xatoni oldindan ko‘rsatadi; backend mustaqil ravishda o‘z tekshiruvini saqlaydi.
3. `isBrokenScheduleConnection` SQLSTATE `08xxx`, admin shutdown `57P01..03`, uzilgan TCP kodi, va socket xatosining `cause` maydonini aniqlaydi.
4. Kalendar saqlashdagi `ROLLBACK` ishlagan taqdirda ham buzilgan PostgreSQL connection pool’ga qaytarilmaydi.
5. Kalendar istisnosini olib tashlashda ham ayni himoya bor.
6. Haftalik va sana bo‘yicha tanaffus mutatsiyalarida ham ayni himoya bor.
7. Kalendar/tanaffus GET snapshot o‘qishlari ham xuddi shu yordamchi orqali ishonchsiz ulanishni tashlaydi.
8. Barcha kalendar/tanaffus GET va mutatsiya yo‘llarida, xatolar ham kirgan holda, `Cache-Control: no-store` o‘rnatiladi.
9. `v113-dependency-readiness.js`: backend/frontend lockfile bilan package.json mosligini va o‘rnatilgan paketlarni faqat o‘qish bilan tekshiradi. O‘zi hech narsani o‘rnatmaydi; paket yo‘q bo‘lsa natija `NOT_RUN` va exit code 1.
10. 2 ta yangi backend va 1 ta frontend regressiya fayli, ularni alohida ishga tushirish uchun npm skriptlar qo‘shildi.

## Tekshiruv buyruqlari

```bash
cd USTARA-New/backend
npm run test:v113:unit
npm run v113:dependencies
node --test test/*.unit.test.js

cd ../frontend
npm run test:v113:unit
node --test test/*.test.js
```

Paketlarni o‘rnatish mumkin bo‘lgan tarmoq/muhitda, **har bir alohida papkada** `npm ci` bajarilsin. O‘rnatish tugamaguncha `npm run build` va dependency talab qiladigan integratsiyalar PASS deb belgilanmaydi.

## Hozirgi muhit dalillari (2026-11-20)

- Frontend: **908 PASS / 0 FAIL** (to‘liq `node:test`; production Vite build sinovi emas).
- Backend: **1281 PASS / 26 FAIL**; 26 FAIL v112 bilan nomma-nom **bir xil** (v112 1254 PASS / 26 FAIL).
- v113 maqsadli backend: **92 PASS / 0 FAIL**; frontend **9 PASS / 0 FAIL**.
- `npm ci --offline`: `ENOTCACHED`; backend va frontend o‘rnatilmagan dependency’lari bor. `v113:dependencies` xavfsiz preflight **NOT_RUN**.
- PostgreSQL: haqiqiy test serveri yo‘q, shuning uchun **NOT_RUN**. v112 lokal read-only tekshiruvi alohida ruxsatsiz ishga tushirilsa, kutganidek `NOT_RUN` chiqadi.
- Vite production build / mobil brauzer / Telegram E2E: **NOT_RUN**.
- 185 qaror reyestri va 45 forward + 2 rollback SQL byte-aniq saqlangan.

**Xulosa:** yangilanish 26 ta eski dependency FAIL’ni yashirmaydi va production-ready deb da’vo qilmaydi. Real PostgreSQL mutatsiya/concurrency sinovlari hali kerak.
