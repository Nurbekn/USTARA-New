# USTARA v178 — #158–#164: ommaviy telefon va manzil/tuman qidiruvi

**Asos:** v177 arxivi. Asl `docs/USTARA_185_NAZORAT.csv` reyestri SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`. Manba auditi: **165/185**, qolgan **20 ta**. Bu production tayyorlik foizi emas.

## Koddagi o‘zgarishlar

### #159 — kelishilgan ommaviy sartarosh telefoni

- `GET /api/barbers/:id` tasdiqlangan (`approved`) va faolligi saqlangan sartaroshning **kanonik `users.phone`** raqamini o‘qiydi. `barberProfile.getPublic()` SQL JOIN faqat `u.role='barber' AND u.deactivated_at IS NULL` uchun ishlaydi; bekor qilingan akkauntlar va tasdiqlanmagan sartaroshlar chiqarilmaydi.
- Public response whitelist faqat `phone` maydoniga kengaytirildi; mijoz telefoni, JWT, parollar, bronlar va ichki akkaunt identifikatorlari qaytarilmaydi.
- Ommaviy profilda 3 tilda **sartaroshga qo‘ng‘iroq** havolasi chiqadi. `tel:` faqat `+` bilan boshlanadigan to‘g‘ri xalqaro raqamdan yaratiladi. Agar maydon yo‘q yoki format noto‘g‘ri bo‘lsa, havola chiqarilmaydi.
- `publicShare.js` hamda boshqa preview metadata telefondan foydalanmaydi. Profil orqali raqamni OTPsiz yangilash huquqi qo‘shilmadi.

### #164 — foydalanuvchi kiritgan haqiqiy manzillardan tuman tanlash

- Explore sahifasidagi **Manzil yoki tuman** filtri endi sartaroshlar ommaga yozgan manzil bo‘laklaridan takliflarni (HTML datalist) ko‘rsatadi.
- Faqat matnda aniq **tumani / tuman / district** deb yozilgan, 3–80 belgilik segmentlar olinadi. Takroriylari tozalanadi, soni 20 tagacha cheklanadi.
- Koordinata, sartaroshning ismi yoki mijoz joylashuvidan tuman **taxmin qilinmaydi**. Filtrning o‘zi avvalgidek serverdan kelgan manzil matniga asoslanadi. Profil almashganda qayta yuklangan katalogda takliflar yangilanadi.
- Hali tarkibiy `district` ustuni, geografik reverse-geocoder yoki manzillar uchun integratsiya testlari yo‘q.

## #158–#164 manba auditi

| # | Qaror | Manba holati |
|---|---|---|
| 158 | Smart Image Optimization | Qisman: lazy va async decoding bor; o‘lchamni avtomatik kichraytirish va real performance testi yo‘q |
| 159 | Sartarosh telefoni ochiq, mijozniki o‘z bronida | Qisman yangilandi: approved/active sartaroshning raqami ommaviy profilida, booking contact chegaralari uchun end-to-end tekshiruv qolgan |
| 160 | Telefon orqali Quick Manual Booking | **Yo‘q:** barber qo‘ng‘iroq kelishuvi bilan normal booking yaratishi hali yo‘q; OTPni chetlab o‘tuvchi yangi ro‘yxatdan o‘tish yo‘li qo‘shilmadi |
| 161 | Takrorlanuvchi tanaffuslar | Qisman: haftalik/jadval break nazorati; real PG concurrency qolgan |
| 162 | Smart Service Change mijoz boshlaydi | Qisman: mijoz boshlab xizmatni o‘zgartirish; real PG/browser testi qolgan |
| 163 | Sartarosh xizmat paytidagi alohida edit | **Bekor qilingan**, yaratilmagan |
| 164 | Manzil va tuman bo‘yicha qidiruv | Qisman yangilandi: faqat e’lon qilingan manzillardan tuman takliflari; real browser E2E qolgan |

## Sinovlar

- Frontend unit: **1695/1695 PASS** (`node --test frontend/test/*.test.js`).
- Backend unit: **1670/1699 PASS** (`node --test backend/test/*.unit.test.js`), qolgan **29 ta** `express` (11), `jsonwebtoken` (9), `bcrypt` (6), `pg` (3) mavjud emasligi sabab ishga tushmagan. To‘liq backend suite PASS **EMAS**.
- Yangi v178 audit va funksional unit-testlar: **10/10 PASS**. `backend/test/v171BarberCertificates.unit.test.js`, `backend/test/v135PublicPreview.unit.test.js` va eski regressiya kutilmalari #159 yangi qoidasiga moslashtirildi.
- Frontend import grafigi: PASS (`node frontend/scripts/v153-source-graph.mjs`). Haqiqiy Vite production build EMAS.
- PostgreSQL E2E, Telegram haqiqiy yetkazish, mobil brauzer E2E, deploy: **NOT_RUN**.
- Yangi SQL migratsiya yo‘q, bazaga hech qanday o‘zgarish qo‘llanmagan.

## Ochiq xavflar

Ommaviy sartarosh telefoni barcha mehmonlarga ko‘rinishi — foydalanuvchi kelishilgan #159 qarori. Qonuniy rozilik va platforma maxfiylik siyosatini productionga chiqishdan oldin rasmiylashtirish kerak. Raqam almashganda profil, OTP va cache siyosati haqiqiy tizimda tekshirilishi zarur. Barcha 185 qarorlarni ko‘rib chiqish ishlab chiqarishga tayyorlikni isbotlamaydi.

**Keyingi bosqich:** v179, #165–#171 qarorlar.
