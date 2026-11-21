# USTARA v71 — registration cross-tab safety

Manba: v70 ZIP; v70 dagi 815 fayl saqlangan.

## Qilingan mustahkamlashlar
- Incoming cross-tab snapshot uchun aniq role/phone/specialty bog‘lanishi.
- Sessiya muddati, OTP muddati, resend cooldown va delivery retry vaqtlarining regressiyasini rad etish.
- Yetkazilgan OTP holatini qaytadan `deliveryPending` holatiga tushirishni rad etish.
- `verified` bosqichidan `otp`ga qaytish yoki tugagan completion sessiyasini qabul qilishni rad etish.
- `block` metadata shaklini va timestamp turlarini tekshirish.
- Faqat ruxsat berilgan bot manzilini qabul qilish; eski bot-yetkazish holatlari uchun `deliveryRetryAt` ixtiyoriy.
- Saqlangan registration snapshot dastlabki yuklanishida helper deklaratsiyasi tayyor bo‘lishi ta’minlandi.

## Testlar
- Frontend Node unit: 225/225 PASS, shu jumladan 20 ta yangi v71 testi.
- `audit-phase1.js`: 185 decisions / 42 forward migrations PASS (offline structural).
- Qarorlar SHA-256 o‘zgarmagan.

## Cheklovlar
- Brauzerda real ikki tab, Chrome, PostgreSQL, GitHub Actions va Telegram live integratsiyasi tekshirilmagan.
- Backend 528/26 tarixiy ko‘rsatkichlar bu bosqichda qayta ishga tushirilmagan.
- Production-ready: YO‘Q.
