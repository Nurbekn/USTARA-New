# USTARA Stage 2 — real PostgreSQL xavfsizlik testi (v8)

Bu integratsiya testi #84 (qurilma sessiyalari), #135 (akkaunt pauzasi), #140 (tiklash so‘rovi) uchun tayyorlandi.
**v8 ish muhitida test PostgreSQL yo‘qligi uchun ishga tushirilmagan.** `npm test` bilan aralashtirmang: `npm run test:stage2:db` alohida ishlatiladi.

## Xavfsizlik

- Faqat **lokal** `ustara_test_db` test bazasi, maxsus **non-superuser** rol va izolyatsiyalangan yangi schema. Hech qachon production database yoki real foydalanuvchilar bilan ishlatmang.
- `test/helpers/accountIntegrityHarness.js` test URL, roli, `search_path`, schema OID va egasini tekshiradi. O‘zi yaratmagan sxemani o‘chirmaydi. Harakatlar tugagach faqat test jarayonida yaratilgan schema tozalanadi.
- Mavjud test PostgreSQL’da `btree_gist` kerakli old-shartlari (odatda `public`) oldindan test administratori tomonidan tekshirilishi lozim. `npm run test:stage2:db` production o‘rnatish yoki migratsiya buyrug‘i emas.
- Test uchun `NODE_ENV=test` va **ikkita ochiq rozilik kaliti** talab qilinadi; aks holda integratsiya testi **SKIP**, muvaffaqiyatli deb belgilanmaydi.
- Xavfsiz tiklash so‘rovi ishlashi — avtomatik hujjat tekshiruvi yoki telefonni qaytarib olish huquqini bermaydi. Tiklashning yakuniy egalikni tasdiqlash qismi hali tugallanmagan.

## O‘z kompyuteringizda ishga tushirish

1. Lokal alohida PostgreSQL server / faqat sinov bazasi `ustara_test_db` va faqat shu bazadagi ish uchun yaratilgan non-superuser test rolini tayyorlang. Test bazasini ulanishdan oldin tekshiring.
2. `cd backend && npm ci` bajaring; `.env` yoki real API kalitini testga kiritmang.
3. Quyidagi namuna qiymatlarni o‘z lokal sinov rolingiz va portingizga moslang. Parolni chatga yoki Git'ga joylamang:

```bash
NODE_ENV=test \
USTARA_TEST_DATABASE_URL='postgresql://ustara_stage2_test@127.0.0.1:5432/ustara_test_db' \
USTARA_ACCOUNT_INTEGRITY_TEST_USERS='ustara_stage2_test' \
USTARA_ACCOUNT_INTEGRITY_TESTS='I_AUTHORIZE_TEST_DATABASE' \
USTARA_STAGE2_SECURITY_TESTS='I_AUTHORIZE_STAGE2_DB_TEST' \
npm run test:stage2:db
```

4. Test yakunida natijalarda **SKIP 0**, testlar va subtestlar **PASS** ekanini tasdiqlang. Agar yetishmayotgan `btree_gist` yoki eskirgan migratsiya xatosi chiqsa, productionga teginmasdan avval test bazasi sxemasini tekshiring.

## Tekshiradigan holatlar

- Login `sid` bilan yangi sessiya yaratadi; shu qurilmadan chiqish JWT'ni keyingi API chaqiruvda bekor qiladi.
- Parol bilan deactivation; eski JWT'ni rad etish; qayta kirishda 423; ongli reactivation va yangi JWT.
- Avvalgi JWT reactivationdan keyin ham yaroqsiz.
- Tiklash so‘rovi ma’lum va noma’lum telefon uchun bir xil tashqi xabar beradi, token DB’da xesh saqlanadi, noto‘g‘ri kod rad qilinadi.
- Admin so‘rovni ko‘rib chiqishi audit jurnalida saqlanadi; foydalanuvchi telefon/paroli o‘zgarmaydi.
- 20261126/27/28 migratsiyalarining tarix belgilari haqiqiy test sxemada mavjud bo‘ladi.

**Cheklov:** bu suite OTP ning haqiqiy Telegram yetkazilishini, 2 ta brauzer parallel E2E'sini va haqiqiy production deploymentni tasdiqlamaydi.
