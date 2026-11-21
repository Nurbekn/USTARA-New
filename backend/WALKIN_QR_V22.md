# USTARA v22 — Bir martalik walk-in QR va sartarosh tasdig‘i

**Holat: kod + unit testlar tayyor; PostgreSQL integratsiyasi va mobil E2E hali o‘tmagan.** v21 queue (33-migratsiya) oldindan o‘rnatilgan bo‘lishi kerak. Bu oldindan bron yoki avtomatik slot ajratish EMAS.

## Oqim

1. Tasdiqlangan sartarosh `Navbat` sahifasida **Yangi QR yaratish**ni bosadi. `POST /api/queue/qr-tokens` (barber JWT) faqat SHA-256 xeshni bazaga yozadi, 10 minutlik, 192-bit maxfiy token chiqaradi. Bir daqiqada 6 ta QR limit. URL va QR SVG tashqi servislarga yuborilmaydi. QR matni `https://SAYT/queue/check-in/<token>` ko‘rinishida; sayt origin'i sartarosh sessiyasi va CORS bilan tekshiriladi, production'da `CORS_ALLOWED_ORIGINS`da bo‘lishi shart.
2. Mehmon QR’ni ochadi. Ixtiyoriy nom bilan `POST /api/queue/qr-requests` (`token`, `request_id` 32 hex) yuboradi. Hozir sartaroshning ish vaqti ochiqligi tekshiriladi; token bir marta ishlatiladi. Natija **faqat pending**, walk-in queue hali yaratilmaydi. Aynan o‘sha `request_id` bilan qayta yuborish eski so‘rovni qaytaradi; boshqa ID / ism rad etiladi. Bir sartaroshda ko‘pi bilan 20 ta (30 daqiqadan yangi) pending QR so‘rovi.
3. Sartarosh `GET /api/queue/qr-pending` (JWT) orqali faqat **o‘zining** so‘rovlarini ko‘radi. `PATCH /api/queue/qr-pending/:id` (`decision: approve | reject`) bilan tasdiqlaydi/rad qiladi. Tasdiq + haqiqiy `walkin_queue` yozuvi + har ikkala audit event **bitta transaction**da, sartaroshning umumiy advisory lock'i bilan bajariladi. Parallel ikki tasdiq ikkinchi navbat yaratmaydi. So‘rov 30 daqiqa ichida ko‘rilishi kerak. Ish vaqti yopilganda tasdiq rad etiladi. Tasdiqdan oldin mehmonning haqiqatda shu joyda ekanini sartarosh tekshiradi.
4. Mehmon `POST /api/queue/qr-status` bilan token + maxfiy request ID jo‘natib, faqat `pending | approved | rejected | expired` statusini ko‘radi. Queue raqami, boshqa mijoz ismi, telefon, band vaqtlar **ommaviy javobda yo‘q**. Poll faqat sahifa ko‘rinib turganda ishlaydi.

## Xavfsizlik va cheklovlar

- QR serverda **SHA-256 domain-separated hash** sifatida saqlanadi, raw token bazada saqlanmaydi; request receipt ID ham xeshlangan. Har ikki token javobi `Cache-Control: no-store`. QR bearer capability: uning fotosurati/havolasi boshqa kishiga uzatilsa ham ishlashi mumkin; bu sababli sartarosh **joyida tekshirib tasdiqlaydi**.
- Origin qat'iy tekshiriladi; `Referrer-Policy: no-referrer` API va frontend HTML’da. QR generatori `backend/vendor/qrcode-terminal` (local QRCode / MIT manba kodi; Apache-2.0 tarqatish LICENSE) orqali ishlaydi, CDN yoki boshqa saytga maxfiy token uzatilmaydi.
- Public QR endpointlari `req.socket.remoteAddress` bo‘yicha **faqat ushbu Node worker ichida** cheklanadi (10 daqiqada join 60/status 300). Ko‘p worker/proxy production’da edge-level shared rate limit, WAF va shaffof, qat'iy trusted-proxy konfiguratsiyasi **alohida zarur**. Client yuborgan `X-Forwarded-For`ga ishonilmaydi. Mijozdan login yoki telefon talab qilinmaydi.
- `walkin_qr_tokens`, `walkin_qr_requests`, `walkin_qr_request_events` — yangi 34-chi `20261205_walkin_qr_approval.sql` migration. Eski navbat/bronlar ko‘chirilmaydi. Barber akkaunt o‘chirilganda bog‘liq QR ma’lumotlari cascade bo‘lib o‘chadi; boshqa ma’lumotlarni saqlash siyosati keyingi bosqichlarda audit qilinadi.
- UI xavfsizlik chegarasi: sartarosh bergan QR bir marta ishlaydi; **realtime public ETA, Telegram chaqiruv, FIFO qo‘lda o‘zgartirish va avtomatik Smart Booking 5 daqiqalik takliflari hali yo‘q**.

## Tekshirish

```bash
cd backend && npm test
cd frontend && npm test
cd frontend && node node_modules/vite/bin/vite.js build
```

Test PostgreSQL bazasi bor bo‘lsa **faqat oldindan ko‘rib chiqilgan, ajratilgan local `ustara_test_db`** va `ustara_account_test` roli bilan, explicit `USTARA_TEST_DATABASE_URL`dan foydalanib:

```bash
cd backend
NODE_ENV=test USTARA_WALKIN_QR_TESTS=I_AUTHORIZE_TEST_DATA \
 USTARA_TEST_DATABASE_URL='<LOCAL_TEST_DB_ONLY_URL>' npm run test:queue:qr:db
```

Bu buyruq migratsiyani o‘zi bajarmaydi. Production DB’ni ulab ishlatmang. Test DB’da barcha 34 migratsiya avval to‘liq va alohida tekshirilgan bo‘lishi kerak. USTARA’ni real mobile browser/Telegram/PostgreSQL testlaridan avval production-ready deb hisoblamang.
