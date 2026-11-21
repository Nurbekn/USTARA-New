# USTARA v31 — QR va Telegram roziligini poyga holatlarida himoyalash

**Holat:** development / staging QA kerak; **production-ready emas**. Asos: v30, 40 forward SQL migration va 185 qaror saqlanadi. OTP ekranida **1:00**, Admin QR **1–120 min**, taklif **5 min**, qabuldan keyin bronni tasdiqlash **2 min** o‘zgarmagan.

## Tuzatilgan xavflar

1. **QR ticket/receipt:** `smartBookingOffers.decide` ticket egasini lockdan **oldin** o‘qiydi. Boshqa transaction navbat tasdig‘ini bekor qilib ulgurishi mumkin. v31 da barber advisory lock, offer/opening/queue `FOR UPDATE`dan **keyin** `walkin_qr_requests` approval `FOR SHARE OF r` bilan **qayta** tekshiriladi. Proof endi faol bo‘lmasa, offerga yozmasdan transaction rollback / `403 ticket_revoked`.
2. **Haqiqiy bron yaratish:** `smartBookingConfirmation.confirm` ham `FOR UPDATE OF f,o,q`dan so‘ng QR ownershipni `FOR SHARE OF r` bilan qayta tekshiradi. Bekor qilingan QR proof bilan booking yoki replay bo‘lmaydi (`404 ticket_missing`). Manual walk-in consentning avvalgi customer+barber lock recheck mexanizmi saqlangan.
3. **Telegram eski tugmasi:** callback chat/message ownershipi birinchi marta tekshirilgach barber lockni kutishi mumkin. Endi `applyDecision` offer/queue qulflangandan **keyin** Telegram outbox+subscriptionni `FOR SHARE OF s,t` bilan yana tekshiradi. Shu paytgacha `/stopqueue` yoki QR offer opt-out bo‘lgan bo‘lsa callback rad qilinadi (`403 callback_revoked`).
4. **Qayta rozilik:** /stopqueue → qayta opt-in qilinganda avvalgi `sent` xabarning inline tugmasi yana kuchga kirmaydi. `offers_consent_at <= sent_at` sharti xabar ayni **rozilik davrida** jo‘natilgan bo‘lishini talab qiladi. Faqat taklifning o‘zi va xabarini jo‘natish davomida haqiqiy consentga bog‘liq callback ishlaydi.
5. **Telegram offer-consent:** QR proof barber+queue lockni kutgach eskirgan bo‘lishi mumkin; `offerConsent` ham approvalni qayta tekshiradi va `403 ticket_revoked` bilan rad qiladi.

### Lock tartibi va chegaralar

- `decide`: barber advisory lock → offer/opening/queue `FOR UPDATE` → QR approval `FOR SHARE` **yoki** Telegram subscription/outbox `FOR SHARE` → status update.
- `confirm`: customer `FOR UPDATE` → barber advisory lock → offer/opening/queue `FOR UPDATE` → QR approval `FOR SHARE` → xizmat/narx, calendar, overlap → booking inserts.
- `offerConsent`: barber advisory lock → queue `FOR UPDATE` → QR approval `FOR SHARE` → Telegram subscription update.
- `FOR SHARE` tufayli tasdiq bekor qilinishi ayni transaction bilan ketma-ketlashadi. Telegram yuborishning tarmoqdagi in-flight race'i esa mavjud bo‘lishi mumkin: opt-outdan oldin boshlangan send yetib kelishi ehtimoli bor. *Exactly-once* Telegram kafolati yo‘q.

## Testlar va qayta tekshirish

```bash
cd backend
npm run test:smart-booking:v31
npm run test:unit
npm run test:smart-booking:v31:db   # maxsus opt-in, env bo‘lmasa SKIP
node scripts/audit-phase1.js
cd ../frontend
node --test test/*.test.js
```

**Real PG testi** `SMART_BOOKING_V30.md` ko‘rsatmasiga muvofiq alohida `ustara_test_db`, non-superuser `ustara_account_test`, `NODE_ENV=test`, read-only sessiyalar bilan ishga tushiriladi. U faqat index/locking katalog auditidir, to‘liq biznes race testi emas. Production bazada xavfli fixture bermang. Local PG mavjud bo‘lmagani uchun v31 da DB sinovi o'tkazilmadi.

### Stagingda bajarilishi shart bo‘lgan scenariylar

- QR r.status revoke bilan bir vaqtdagi `accept` va `confirm`: revoke oldin commit qilsa hech qanday booking, confirm yoki acceptance yozilmaydi.
- Telegram `/stopqueue` / offer opt-out bilan bir vaqtdagi callback; keyin qayta opt-in qilib eski `message_id`ni bosish ham 403, yangi consent davridagi yangi xabar ishlashi kerak.
- Ikkita ulanishda `claim/claim`, `revoke/accept`, `accept/confirm`, worker accepted expiry; ikki booking overlap real PG exclusion constraint bilan tekshiriladi.
- `npm ci` bilan barcha backend tests, frontend Vite production build/ESLint, Telegram polling va webhook imzolari, haqiqiy Android/iOS browser E2E.

## Qayd etilgan local natija (2026-11-18)

- Tanlangan v31 regressiya **39 PASS**; frontend **155 PASS**.
- Full backend **253 PASS / 26 MODULE_NOT_FOUND** (`jsonwebtoken`, `express`, `bcrypt`, `pg`); bunlar dependency sabab ishga tushmagan testlar, lekin full suite hali PASS hisoblanmaydi.
- Offline phase1 audit: **185 qaror / 40 migration PASS**. Migratsiya qo‘shilmadi va hech qanday real DBga SQL ishlatilmadi.
- Haqiqiy Telegram API, real PostgreSQL race, mobil E2E, Vite production build/lint **bajarilmadi**. **Production-ready EMAS.**

Arxivga `.env`, login/token/password, `node_modules`, `dist`, backup, credential va private key kiritilmasin.
