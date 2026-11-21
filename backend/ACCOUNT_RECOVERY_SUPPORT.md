# USTARA #140 — manual tiklash so‘rovlari (v6)

Bu funksiya **eski telefon ham, Telegram ham yo‘qolgan** holatda Admin tekshiruvi uchun **murojaat ochish va holatini ko‘rish** imkonini beradi. Hech qaysi endpoint parol, telefon, Telegram bog‘lanishi yoki sessiya huquqini o‘zgartirmaydi. Shaxsni tekshirishning mustaqil, xavfsiz huquqiy-operatsion jarayoni hali to‘liq ishlab chiqilmagan; **tiklashni avtomatik yakunlash mumkin emas**.

## Marshrutlar

- `POST /api/auth/account-recovery/start` — `{ "phone": "+998901234567" }`. Raqam tizimda bor-yo‘qligidan qat’i nazar bir xil umumiy javob, tasodifiy `caseId` va maxfiy `ticketToken` qaytaradi. Kirish shart emas. Rate-limit: IP 5/15min va telefon 2/24h (mavjud PostgreSQL/HMAC limit xizmati). Murojaatga hujjat yoki parol biriktirilmaydi.
- `POST /api/auth/account-recovery/status` — `{ "caseId": "...", "ticketToken": "..." }`. SHA-256 token tengligini server tekshiradi; token DB’da ochiq ko‘rinishda saqlanmaydi. Kuzatuv 14 kungacha. Faqat holat va yangilanish vaqti qaytadi.
- `GET /api/admin/account-recovery/cases` — faqat faol USTARA Admin; so‘nggi 100 so‘rov (telefon raqami, holat, sana). So‘rov egasiga oid parol yoki maxfiy token ko‘rsatilmaydi.
- `POST /api/admin/account-recovery/:id/review` — Admin `{ "status": "reviewing|verification_needed|closed", "reason": "..." }` bilan holatni o‘zgartiradi. O‘zgarishlar tranzaksiyada yoziladi va Admin ID bilan tarixda qoladi. Yopilgan so‘rov qayta o‘zgartirilmaydi.

## Xavfsizlik talablari

1. **Hech qanday avtomatik credential reset yo‘q.** Admin qaroriga asoslanib ham ushbu endpointlar parol yoki telefonni almashtirmaydi; mustaqil shaxs tasdig‘i ish jarayonini yaratish va sinovdan o‘tkazish qoladi.
2. Foydalanuvchi sahifada berilgan `caseId.ticketToken` kodini o‘zi saqlashi kerak. Kodni chatga, boshqa foydalanuvchiga yoki loglarga yubormasin.
3. **Production**: SSL/TLS, to‘g‘ri reverse proxy, real administratorga xavfsiz aloqa kanali, abuse monitoring, data-retention siyosati va shaxsiy ma’lumotlarni o‘chirish jarayoni ishlab chiqilmaguncha deploy qilmang.
4. `20261127_manual_account_recovery.sql` — oldingi tarixiy migratsiyalardan keyin qo‘lda ishlatiladigan **forward-only** migration. Mavjud bazani zaxiralash, nomini/hostini tekshirish va alohida test bazada sinash kerak. Bu kod bazaga avtomatik ulanib SQL bajarmaydi.

## Sinov

`node --test test/manualAccountRecovery.unit.test.js` — modelga asoslangan 5 ta mustaqil unit test. Bu real PostgreSQL, browser E2E yoki Telegram testlari emas.
