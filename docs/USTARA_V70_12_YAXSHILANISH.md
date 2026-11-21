# USTARA v70 — profil va onboarding xavfsizligi

Manba: `USTARA-4-Bosqich-Registration-Integrity-v69.zip`.

## 12 ta amaliy yaxshilanish

1. Ism va familiya bitta umumiy validatorga birlashtirildi (`profileIdentity.js`).
2. Unicode NFC normalizatsiya bir xil qo‘llanadi.
3. Bo‘shliqlar, tab va yangi qator ketma-ketligi bitta bo‘shliqqa o‘tkaziladi.
4. Ko‘rinmas belgilar va control character ismga qabul qilinmaydi.
5. 80 belgilik limit Unicode code point asosida o‘lchanadi.
6. Noto‘g‘ri turdagi qiymatlar (null/son) xavfsiz rad etiladi.
7. Pending registration va odatiy profile-completion bitta validatsiyadan foydalanadi.
8. Profile completion backendga kanonik ism/familiyani uzatadi.
9. Profil yakunlanganligini tekshirish ham xuddi shu talabga asoslanadi.
10. Profil nomlarini ko‘rsatishda Unicode bo‘shliqlar normalizatsiya qilinadi.
11. Cross-tab eski OTP xabari tekshirilgan bosqichni orqaga qaytara olmaydi.
12. Cross-tab eski completion deadline yoki resend cooldown yozuvi yangiroq holatni bekor qila olmaydi.

## Testlar

- Frontend: 205/205 PASS (`npm run test:unit`).
- Yangi v70: 16/16 PASS (`node --test test/v70IdentitySafety.test.js`).
- Qaror reyestri: 185; asl SHA-256 o‘zgarmagan.
- Migratsiya: 42 forward, 2 rollback; offline audit PASS.
- Brauzer, PostgreSQL, GitHub Actions va Telegram haqiqiy integratsiyasi: NOT_RUN.
- Vite build: NOT_RUN (npm dependency o‘rnatilmagan).
- Production-ready: YO‘Q.

## Cheklovlar

Bular frontend validatsiya va unit sinovlaridir. Serverdagi autentifikatsiya, backend role authorization va real brauzerda ikki tab orasidagi aloqa alohida integratsion sinovni talab qiladi. 185 talabdan birortasi faqat shu testlar bilan production tasdiqlangan deb belgilanmadi.
