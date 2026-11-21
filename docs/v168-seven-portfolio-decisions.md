# USTARA v168 — asl #88–#94 qarorlar: portfolio 6 ta eng yaxshi ish

## Mazmuni va tekshirish chegarasi

- Kirish: `USTARA-v167-185-Comment-Pins-Spam-Moderation-Seven-Decisions.zip`.
- Asl 185 qaror reyestri (`docs/USTARA_185_NAZORAT.csv`) baytma-bayt o‘zgarmagan.
- **7 ta yangi noyob qaror manba auditi:** 89 → **96/185**, 89 ta indekslanmagan.
- Bu indeks — kod/testga yo‘llanma, **tayyorlik foizi ham, production tasdig‘i ham emas**.

## #91 — yangi kod

1. `20261222_portfolio_featured_posts.sql` forward migratsiyasi `social_posts.featured_at TIMESTAMPTZ` va portfolio indeksini qo‘shadi. Bu **51-forward** migratsiya; mavjud 50 ta forward va 2 rollback fayli saqlangan. SQL productionga yoki test DBga qo‘llanmagan.
2. Authenticated `PUT /api/social/posts/:id/featured` — faqat post egasi bo‘lgan tasdiqlangan sartarosh uchun, aynan `{ "featured": true | false }` body. Server sartarosh row lockini olib, limitni shu tranzaksiyada tekshiradi. **Ko‘pi bilan 6 ta** ishni belgilashga ruxsat beradi, yettinchisida `409 featured_limit`; oldindan belgilangan ishni qayta belgilash idempotent. DB `COMMIT` natijasi noma’lum bo‘lsa muvaffaqiyat qaytarmaydi.
3. Portfolio va mehmon ko‘rinishidagi postlar `featured_at` bo‘yicha tepaga chiqadi, qolganlari sana bo‘yicha. Global ijtimoiy feed tartibiga bu qoida qo‘llanmaydi. Belgilangan postlar uchun ★ ko‘rsatiladi, mijoz o‘zgartira olmaydi.
4. Sartarosh Portfolio post ko‘rish oynasida belgini qo‘shishi/olishi mumkin. UI eski natijani haqiqiy holat deb o‘ylamasligi uchun faqat server natijasidan va qayta yuklangan portfoliodan keyin yangilanadi. Tugmada 6/6 chegarasi aks etadi. Yangi belgilar Uzbek/Russian/English matnlarga ega.
5. Drag-and-drop individual qo‘lbola joylashtirish, real PostgreSQL transaksion race va brauzer E2E **NOT VERIFIED**. Bitta ishning belgisini olib, qayta belgilash uni eng yuqoriga ko‘taradi, ammo bu mustaqil reorder API emas.

## #88–#94 qarorlar holati

| # | Asl qaror | Dalil va ochiq qism |
|---|---|---|
| 88 | Mijoz bron izohi va ilova rasmi | Bron yaratish bor, ammo bron bilan saqlanadigan matn/rasm, ruxsat, saqlash siyosati **YO‘Q** |
| 89 | Smart Review kriteriyalar va moderatsiya | Yakunlangan bron uchun 1–5 yulduz sharhi bor; mezonlar, shikoyat/apellyatsiya, fraud moderatsiyasi **YO‘Q** |
| 90 | Advanced Break Manager | Weekly/dated break mavjud; haqiqiy PostgreSQL va jadval race E2E **NOT VERIFIED** |
| 91 | Portfolio tartibi va 6 ta pinned ish | 6 tagacha belgilash va prioritet tartib yangi kodda; manual reorder va real E2E **NOT VERIFIED** |
| 92 | 7 kunlik Smart Availability Explorer | 7 kunning read-only tekshiruvchisi mavjud; oxirgi slot alohida server kotirovkasini talab qiladi, E2E **NOT VERIFIED** |
| 93 | Profilni mijoz ko‘rinishida tekshirish | Ommaviy profil preview va havola mavjud; to‘liq piksel/sessiya tengligi **NOT VERIFIED** |
| 94 | Adolatli Smart Ranking | Aniqlangan relevance/masofa va kuzatilganlar tartibi mavjud; algoritmik adolat/sponsor audit va salohiyatli bias **NOT VERIFIED** |

## Haqiqatan bajarilgan sinovlar

- Frontend to‘liq Node unit testlari: **1653/1653 PASS**, 0 fail.
- Backend `.unit.test.js` to‘plami: **1603/1632 PASS**, 29 fail. Bular oldingi versiyadagi kabi `express`, `pg`, `jsonwebtoken`, `bcrypt` paketlari topilmagan testlardir. Backend umumiy suite **yashil emas**.
- v168 maqsadli audit, backend va frontend manba/unit testlar: **10/10 PASS**.
- O‘zgargan 7 ta JS/JSX fayli TypeScript parser sintaksis tekshiruvdan o‘tdi.
- `v153` frontend manba grafigi PASS; `v67` migratsiya auditi **51 forward, 2 rollback; OFFLINE_PASS**.
- Haqiqiy PostgreSQL, Telegram, Chrome E2E, Vite production build: **NOT RUN**. Backend va frontend `node_modules` to‘liq o‘rnatilmagan.

## Chiqarishdan oldingi ishlar

- PostgreSQLga ruxsat etilgan test muhitda migratsiyani ishga tushirib, 6/7 belgilash parallelligini va egasini tekshirish.
- Browserda Portfolio ↔ public profile har ikki tilda/sessiyada ko‘rish; video, rasm, postni o‘chirish va akkaunt almashish bilan tekshirish.
- #88, #89 va #94 dagi qolgan arxitektura/ma’lumot siyosatlarini alohida ishlab chiqish.

**Natija:** 96/185 manba izi; v168 **production-ready emas**. Hech qanday haqiqiy baza yoki serverga o‘zgartirish kiritilmadi.
