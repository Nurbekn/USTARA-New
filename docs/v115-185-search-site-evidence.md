# USTARA v115 / 185 qaror — Smart Search va bron yo‘li (2026-11-20)

**Asos:** `USTARA-v114-Reconstructed-From-v113.zip` (1027 fayl), SHA-256 `a3d28aeba797a9be7ba3207cf7baf742ef7e2a21ee8e2a90d55069460f8fa190`.
Bu tarixiy v114 ning byte-to-byte nusxasi emas, foydalanuvchi yuborgan v113 dan qayta tiklangan ishchi baseline.

## Aynan foydalanuvchi belgilagan qarorlar

- **#16 — Smart Search qidirish va filtrlar:** eski qidiruv endi ism/familiya, mutaxassislik, salon, xizmat, ko‘rsatilgan manzil bo‘yicha ko‘p so‘zli izlaydi; mavjud narx va xizmat filtrlari saqlandi. **QISMAN** (server miqyosida reyting/sort, matnli qidiruv ko‘lami va haqiqiy brauzer tekshiruvi qolgan).
- **#164 — Manzil va tuman bo‘yicha qidiruv:** katalogdagi `address` matniga asoslanuvchi mustaqil `area` filtri va uning URL parametri/chiqarib tashlash tugmasi qo‘shildi. **QISMAN** (strukturaviy tuman DB ustuni va geokodlash yo‘q; faqat sartarosh kiritgan manzil qidiriladi).
- **#42 — Profil bron qilish tugmasining ustuvorligi:** karta ichida `Bron qilish` tezkor tugmasi qo‘shildi, xizmatlari mavjud bo‘lgan tasdiqlangan sartarosh uchun xizmatlar tabiga olib boradi; booking avtomatik ochilmaydi/tasdiqlanmaydi. **QISMAN** (real mobil E2E qolgan).
- **#1 / #58 — Responsiv uy/card interfeysi va mobil dizayn:** Explore actions hamda filtrlari kichik ekranlarda joylashishi yaxshilandi, Home qidiruv placeholderi aniqlashtirildi. **QISMAN** (barcha sahifa responsive tekshiruvi emas).

## 7 ta bajarilgan kichik ish

1. Original 185 qatorli CSV va baseline yaxlitligi tekshirildi; user qarorlari o‘zgartirilmadi.
2. Qidiruv matnida katta-kichik harf, apostrof va takror bo‘shliq normalizatsiyasi saqlandi/yaxshilandi.
3. Ko‘p kalit so‘zli izlash ism, kasb, salon, xizmat va manzilni birgalikda qidiradi.
4. Mustaqil manzil/tuman filtri `area` qo‘shildi; manzili yo‘q profilga tuman to‘qib chiqarilmaydi.
5. URL-parametr, tanlangan filtr chiplari va tozalash funksiyasiga yangi filtr qo‘shildi.
6. Sartarosh karta havolasida bevosita profilning xizmatlar sahifasiga tez o‘tish tugmasi, bron xizmatlari bo‘lmasa esa bunday tugma yo‘q.
7. Mobil CSS, tushunarli qidiruv matni va yangi regressiya testlari qo‘shildi.

## Tegilgan kod

- `frontend/src/pages/user/explore/catalog.js`
- `frontend/src/pages/user/Explore.jsx`
- `frontend/src/pages/user/Explore.css`
- `frontend/src/pages/user/explore/ResultCard.jsx`
- `frontend/src/pages/user/UserHome.jsx`
- `frontend/test/exploreCatalog.test.js`

## Tekshiruv va cheklovlar

- `node --test frontend/test/exploreCatalog.test.js`: **18 PASS**, 0 FAIL (shundan 9 yangi test).
- `npm test` (`frontend`): **917 PASS**, 0 FAIL, 0 SKIP.
- `node scripts/v67-decision-audit.cjs`: 185 qaror, CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — OFFLINE PASS.
- `node scripts/v67-migration-audit.cjs`: 45 forward + 2 rollback SQL — OFFLINE PASS.
- Backend kodiga tegilmadi. Avvalgi backend test xatolari hozir qayta tekshirilmagan.
- `frontend/node_modules` yo‘q. Vite production build, real brauzer/E2E, PostgreSQL, Telegram va deploy: **NOT_RUN**.
- **Production-ready: YO‘Q.**

## Keyingi 7 ishning tavsiya etilgan yo‘nalishi

#1/#58 mobil dizaynni real ko‘rinishda, #3/#42 public profil va bron oqimi, #16/#164 yangi qidiruvni API bilan real ma’lumotlarda, #92 bo‘sh 7-kunlik slotlar ko‘rinishini tekshirish. Sinovlar asosida aniq topilgan nuqsonni tuzatish; 185 qaror CSV va eski SQL migratsiyalarni o‘zgartirmaslik.
