# USTARA v123 — qidiruv, masofa va bron yo‘li dalillari (2026-11-20)

Asos: v122 ZIP (1 047 fayl; SHA-256 `2cd74fede5c4ea11eadbe6879118d94fcb83818b996c0710f265aa4ba14a8bab`).
Bu tarixiy v114 nusxasi emas; v113 asosida qayta tiklangan v114 orqali v122 ga kelgan dastur.

## 185 qarorga mos 7 texnik ish

1. **#16/#164**: `distance_asc` saralashi. Profil manzili koordinatasi mavjud bo‘lsa, sartaroshlar taxminiy to‘g‘ri chiziqdagi masofaga qarab ko‘rsatiladi.
2. **#16/#164**: manzil/koordinata noma’lum sartaroshlar masofa saralashida oxiriga tushadi; bir xil masofada API tartibi saqlanadi. Mijozning manzili bo‘lmasa bu saralash bloklanadi va tushunarli izoh chiqadi.
3. **#3/#164**: katalog kartasida ikki tarafning koordinatalari ma’lum bo‘lsagina taxminiy *to‘g‘ri chiziqdagi* masofa ko‘rsatiladi. Bu haydash/yurish marshruti emas, xaritada aniq masofani taxmin qilib bo‘lmaydi.
4. **#16**: noto‘g‘ri `sort`, `map`, `type`, `profile` havola qiymatlari qidiruvni kengaytirib yubormaydi.
5. **#16**: URL'da bir xil filtr ikki marta kelganda aniq xato qaytariladi; noto‘g‘ri uzun `region/category` bloklanadi.
6. **#3/#42**: API'dagi bir xil sartarosh ID ikkita profilga bog‘lanishdan himoya, bosh sahifada xizmati bo‘lmagan sartaroshga soxta «Bron qilish» CTA bermaslik, qidiruv matniga 160 belgi chegarasi.
7. **Dalil/test**: yangi `frontend/test/v123DistanceSearchAndLinkSafety.test.js`; avvalgi regressiyalarga mos kelmay qolgan eski saralash testi yangi qat’iy qoidaga moslandi; 185 CSV va SQL migratsiyalar baytma-bayt saqlandi.

## Haqiqiy test holati

- Frontend Node unit: **1019 PASS, 0 FAIL, 0 SKIP**; yangi v123 testlari **12/12 PASS**.
- Backend Node unit: **1327 PASS / 26 FAIL**; shu 26 test nomi v122 bilan **bir xil**. Asosiy sabab — lokal npm dependencylar mavjud emas.
- `node --check` va TypeScript `transpileModule` (5 o‘zgargan JS/JSX fayl): **0 sintaksis xatosi**. Bu Vite production build emas.
- npm registry: **EAI_AGAIN** (DNS), paketlar tayyor emas; `npm run build` — **exit 127: vite not found**.
- 185 qaror CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` **saqlandi**. Holat reyestri tarixiy, implementatsiya tasdig‘i emas.
- 45 forward + 2 rollback SQL migratsiya **saqlandi**; offline migratsiya auditi PASS.
- Real PostgreSQL, mobil brauzer, Telegram E2E, deploy **NOT_RUN**. **Production-ready: NO**.

## Keyingi tekshiruv

Internet ishlaydigan izolyatsiyalangan Ubuntu muhitda backend/frontend `npm ci`, keyin barcha testlar va `npm run build`, faqat maxsus `ustara_test_db` bazasida integratsiya; real mobil qurilmada qidiruv→profil→xizmat→bron jarayonini tekshirish. Ishchi PostgreSQL bazasiga test ulanmasin. Asl 185 javob yoki migratsiyalarni o‘zgartirmaslik kerak.
