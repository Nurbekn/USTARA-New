# USTARA v116 — 185 qaror: public profil, bron CTA va mobil mustahkamlik (2026-11-20)

**Asos:** `USTARA-v115-185-Smart-Search-Site.zip` SHA-256 `9bd0e57a2f9d8706218cf16afc7b487122f8a27e6bc11fac529ef978aa2f1fed`.
Bu dastlabki v113 dan mustaqil qayta tiklangan v114 → v115 zanjirining davomi; *tarixiy v114 baytma-bayt nusxasi* degani emas.

## 7 vazifa: foydalanuvchining 185 qaroriga mos

1. **Manba va qarorlar** — 185 qatorli asl CSV SHA-256 bilan tekshirildi; qarorlarga tegilmadi, soxta 'TAYYOR' statuslari yozilmadi.
2. **#3 Instagram uslubidagi public profil** — mavjud post grid/galereya, ish vaqti, sharhlar bo‘limlari URL tab holati bilan bog‘landi (`?tab=posts/services/hours/reviews`), invalid tab xavfsiz `services`ga qaytadi.
3. **#42 Bron ustuvorligi** — profil sarlavhasi ostiga asosiy `Bron qilish` CTA qo‘shildi; mavjud `InlineBooking`ga o‘tadi, hech bir bron avtomatik yozilmaydi.
4. **#42/no-service holati** — xizmat bo‘lmasa bosilganda ishlamaydigan tugma o‘rniga aniq xabar chiqadi; katalog tezkor CTA'si qidiruvga qaytish (`from`) holatini saqlaydi; rebooking `services` query parametri yo‘qolmaydi.
5. **#3 Post API barqarorligi** — noto‘g‘ri media/post bo‘lsa post qismi aniq xatoga o‘tadi, butun booking profili ishdan chiqmaydi. Video/rasmga asoslangan post tugma nomi yordamchi texnologiyalar uchun yaxshilandi.
6. **#1/#58 Mobil UI** — 320–359px o‘lchamda stats/tab/CTA joylashuvi, 44px+ touch nishonlari, dark blue theme tokenlari, post/review ko‘rinishi va modal media o‘lchovi yaxshilandi. Brauzer screenshot / real device hali tekshirilmagan.
7. **Regression va offline integrity** — yangi URL, qidiruvdan kelgan CTA, post validation, video uchun unit testlar; butun frontend va 185 qaror / SQL migratsiyalar auditlari.

## Aynan qarorlarning holati

- **#3:** QISMAN — public profil, post grid, media sheet, tab navigation; social follow/comment kabi barcha Instagram funksiyalari shu bosqichda to‘liq tekshirilmagan.
- **#42:** QISMAN — UI va tab yo‘li; haqiqiy bron E2E, DB tranzaksiya tasdig‘i qolgan.
- **#1/#58:** QISMAN — CSS va kod ko‘rib chiqildi; mobil Chrome/Safari qurilmalarda E2E qolgan.
- **#16/#164:** v115 funksiyalari saqlandi; to‘liq server/DB qidiruv tekshiruvi keyingi ish.
- **#92:** 7 kunlik Smart Availability Explorer hali bajarildi, deb e'lon qilinmaydi.

## Test dalillari

- `node --test frontend/test/profileNavigationV116.test.js frontend/test/publicProfile.test.js`: **20 PASS**, 0 FAIL, 0 SKIP (8 yangi navigation, 2 yangi adapter test).
- `npm test` frontend: **927 PASS**, 0 FAIL, 0 SKIP (v115: 917).
- JSX TypeScript parser smoke: **2/2 PASS**.
- `node scripts/v67-decision-audit.cjs`: **185 qaror**, SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` PASS.
- `node scripts/v67-migration-audit.cjs`: **45 forward + 2 rollback** OFFLINE PASS.
- Backend application / PostgreSQL / Vite build / haqiqiy mobil-brauzer / Telegram E2E: **NOT_RUN**. `node_modules` va tarmoqga ulanish yo‘q. Production-ready **YO‘Q**.

## Keyingi v117 (7 ish)

#92 foydalanuvchi tanlayotgan xizmatga mos 7 kunlik bo‘sh vaqt ko‘rinishi (faqat API dalili asosida, soxta availability yo‘q), #16/#164 API qidiruv contract testi, haqiqiy Vite/browser test imkon bo‘lsa va endpointlar/bron/QR/slot sinovlari. 185 CSV va SQL migratsiyalarni saqlash.
