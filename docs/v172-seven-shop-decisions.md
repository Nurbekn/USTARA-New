# USTARA v172 — #116–#122 sartaroshxona va jamoa qarorlari

**Manba:** USTARA v171 (1325 fayl), `docs/USTARA_185_NAZORAT.csv` (asl SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`); source audit **123/185**. Bu **tugatildi** degani emas. Qolgan manba auditlari: **62**.

## Bu versiyada yangilangan mahsulot kodi

- **#119 — sodda, bitta manzilli shop, QISMAN:** `barber_owned_shops` jadvali va `PUT /api/shops/mine`, `GET /api/shops/mine`. Hozircha **har sartaroshga faqat bitta** profil, **bitta** manzil, nom, tavsif, o‘zi ommaviy qilishi yoki yashirishi. Sessiya va haqiqiy user/barber bog‘lanishi har yozishda tekshiriladi; `FOR UPDATE` qulfi va `expectedRevision` orqali eski yozish rad qilinadi. Faqat `verification_status='approved'` bo‘lgan barber ommaga chiqaradi. SQL migratsiya: `20261226_single_address_barber_shops.sql`, oldingi migratsiyaga **qo‘shimcha**; baza **migratsiya qilinmadi**.
- **#120 — mehmon uchun ommaviy shop profili, QISMAN:** `GET /api/shops/:id` va `/api/shops/by-barber/:barberId`, `GET /shops/:id` React sahifasi; barber ommaviy profilidan shop profiliga havola. Profilga faqat nom/manzil/tavsif va bitta sartarosh profiliga havola chiqadi. Shop **USTARA tomonidan tasdiqlanmagan** deb ochiq belgilangan; telefon, xodimlar va mijoz ma'lumotlari yo‘q. Shop ommaga chiqishi uchun sartarosh tasdiqlangan, akkaunt faol va shop e’lon qilingan bo‘lishi kerak. Shopning manzilini o‘zgartirish ilgari tasdiqlangan bronlarni o‘zgartirmaydi.
- **#121 — mijoz tasdiqlaydigan matching, QISMAN:** oldindan mavjud barber solishtirish va aniq sartaroshni tanlab bron qilish kodeksi manba sifatida tekshirildi. **Salon jamoasi ichidan avtomatik matching** va mijozning shu tanlovni tasdiqlash jarayoni **YO‘Q**.

## #116–#122 aniq audit

| # | Qaror | Holat |
|---|---|---|
| 116 | Sartaroshxona analitikasi | **YO‘Q**: jamoa tushumi/bron hisobotlari yoki tenancy tekshiruvi yo‘q |
| 117 | Jamoa smenalari va tasdiqlash | **YO‘Q**: staff/shift/approval modeli yo‘q |
| 118 | Jamoa ichidagi e’tirof | **YO‘Q**: jamoa va abuse nazorati yo‘q |
| 119 | O‘zbekiston uchun sodda bitta manzilli shop | **QISMAN**: faqat yakka barber shop profili |
| 120 | Sartaroshxona ommaviy profili | **QISMAN**: guest profil, lekin shop galereyasi, jamoa va sharhlar yo‘q |
| 121 | Mijoz tasdiqlaydigan barber matching | **QISMAN**: manual solishtirish/individual bron; auto matching yo‘q |
| 122 | Jamoa katalogi va individual narxlar | **YO‘Q**: faqat shaxsiy sartarosh xizmatlari, shop katalogi yo‘q |

## Sinov va xavfsizlik cheklovlari

- Yangi #119/#120 server + frontend + #116–#122 audit maqsadli testlar: **13/13 PASS**. Unda sessiya/egaligini tekshirish, publish faqat verified barber, revision, kommit noma'lumligi, public ma'lumot chegarasi bor. Unit testlar PostgreSQL o‘rniga mock DB bilan ishlagan.
- Umumiy frontend: **1666/1666 PASS** (Node unit). TypeScript parser bilan 6 ta o‘zgargan/yangi JSX fayl sintaksisi PASS. Import grafigi PASS.
- Backend: yakuniy unit natijalarini `docs/v172-integrity-report.json`ga qarang; oldingi v171 holatida 29 test `express`, `pg`, `bcrypt`, `jsonwebtoken` paketlarisiz o‘tmasdi.
- Migratsiya audit: **55 forward + 2 rollback** (offline) PASS. Eski 54 forward SQL fayl hamda 2 rollback o‘zgarmaydi; yangi migratsiya production/stagingda **ishlatilmadi**.
- **PostgreSQL, haqiqiy Express HTTP, brauzer E2E, Telegram, production Vite build va parallel psql tranzaksiya tekshiruvi O‘TKAZILMAGAN.**
- Yangi shop jadvali salonning ko‘p xodimli a’zolik/owner-transfer/RBAC/governance vositasi **EMAS**. Admin shopni verifikatsiya qilish hali yo‘q. Qo‘lda bron va boshqa bron mexanizmlari o‘zgartirilmadi. Production-ready: **YO‘Q**.

Keyingi bosqich: **v173 — #123–#129**. 185 audit tugagach, qisman va bajarilmagan ishlar alohida yakunlanadi; shu paytgacha **LOYIHA TUGADI** yozilmaydi.
