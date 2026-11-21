# USTARA v166 — #74–#80: ixtiyoriy ko‘rsatmalar va media yuklanishi

## Tekshirilgan manbalar

- Kirish: `USTARA-v165-185-Admin-Telegram-System-Ops-Seven-Decisions.zip`.
- Asl 185 qaror reyestri: `docs/USTARA_185_NAZORAT.csv` (o‘zgarmadi).
- Mavjud yordam markazi `frontend/src/pages/help/`, ro‘yxatdan o‘tish/OTP va uch tilli Admin interfeysi; mijoz/sartarosh layoutlari; Ilhom post va media komponentlari.
- v155 kritik auditida **#75 va #76 avval indekslangan**. Shu sabab v166 yetti qarorni tekshiradi, **faqat beshta** yangi noyob qarorni qo‘shadi: **77 → 82/185**. Qolgan **103** qaror indekslanmagan. Bu production tayyorligi emas.

## Yangi ishlar

1. `ContextGuideV166` — mijoz va sartarosh kabinetida sahifaga mos, **ixtiyoriy** ko‘rsatma. Birinchi holatda yopiq; foydalanuvchi o‘zi ochadi yoki butun sessiya uchun yashiradi. Hech qanday API request, analytics, autentifikatsiya o‘zgarishi yoki bron yozuvi yo‘q.
2. Guide tanlovi faqat ruxsat etilgan kabinet sahifalari va `role + accountId` asosida. Yashirish holati `sessionStorage`da faqat oddiy identifikator bilan saqlanadi; parol, telefon va JWT bu kalitga yozilmaydi. Akkaunt almashganda komponent qayta yaratiladi.
3. Mijoz va sartarosh uchun kontekst matnlari **uz / ru / en** tillarida, faqat ichki havolalar. Yordam markazi ochiq, mavjud qidiruv mavzularidan foydalanadi.
4. Media: Ilhomdagi suratlarda `loading=lazy`, `decoding=async`, faol bo‘lmagan slaydlar uchun `fetchPriority=low`; video slaydlarda faol bo‘lmaganga `preload=none`, faolga `metadata`. Sartarosh profilidagi video thumbnail `preload=none`; ommaviy portfolio va katalog suratlariga asinxron decode qo‘shildi.
5. Yangi audit skripti va testlar CI ning offline manba tekshiruvida ishlaydi. Tarixiy CSV/migratsiyalar o‘zgartirilmadi.

## Asl #74–#80 qarorlar holati

| # | Talab | Natija / ochiq qismi |
|---|---|---|
| 74 | Ixtiyoriy onboarding | Yopiq boshlanuvchi kontekst paneli va mavjud yordamdagi ixtiyoriy 3 qadam; haqiqiy browser foydalanish sinovi yo‘q |
| 75 | Smart Support yordam markazi | v155 da allaqachon hisoblangan; mavjud FAQ/qidiruv 3 tilda; AI operatori yoki jonli support yo‘q |
| 76 | O‘zbek, rus, ingliz va Admin tarjimasi | v155 da allaqachon hisoblangan; til tanlash va manba testlari bor; barcha sahifalar browser E2E tekshirilmagan |
| 77 | Mavjud signup va qisqa onboarding | Mavjud OTP ro‘yxatdan o‘tish o‘zgarmadi, yangi ko‘rsatma majburiy emas; haqiqiy OTP/signup E2E yo‘q |
| 78 | Kontekst onboarding ko‘rsatmalari | Kabinet va joriy sahifaga mos 3 tildagi qo‘llanma qo‘shildi; browser accessibility audit yo‘q |
| 79 | Media optimallashtirish | Lazy, async decode va video metadata defer; CDN, server thumbnail, responsiv variant va tarmoq benchmarklari yo‘q |
| 80 | Shaxsiy va hamkorlikdagi to‘plamlar | Faqat oldingi saqlangan postlar ro‘yxati bor. Nomi bor to‘plamlar, xususiylik, hamkorlik va ruxsat nazorati **YO‘Q** |

## O‘tkazilgan testlar

- **Frontend umumiy unit testlar:** 1649/1649 PASS (legacy v149 media testi yangi `preload` qoidasi bilan moslashtirildi).
- **Backend unit suite:** 1585/1614 PASS, 29 ta test muhitda o‘rnatilmagan `express`, `pg`, `jsonwebtoken`, `bcrypt` kutubxonalariga bog‘liq xatolar bilan o‘tmadi. To‘liq suite yashil emas.
- **v166 maqsadli testlar:** 7/7 PASS (frontend 6, backend 1).
- **v153 source graph:** PASS.
- **8 ta o‘zgargan JSX fayl sintaksisi:** TypeScript parser bilan 8/8 PASS.
- **Oldingi fayllar:** 1271 fayldan **0 ta o‘chirilgan**, eski 185 qaror CSV va SQL fayllar **o‘zgarmagan**.
- PostgreSQL integratsiya, real OTP/Telegram, haqiqiy Chrome E2E, production Vite build, CDN tezlik sinovi: **NOT RUN**.

## Keyingi zarur ishlar

- #80 uchun hamkorlikdagi to‘plamlar server sxemasi, role/ACL ruxsati, invite/join/revoke auditlari va PostgreSQL concurrency testlari kerak. Buni oddiy `savedPosts` borligi bilan bajarilgan deb ko‘rsatish mumkin emas.
- #74/#78 uchun mobil browser va screen-reader foydalanish sinovi, #79 uchun haqiqiy tarmoqdagi CWV/media benchmark, #75 uchun support jarayoni kerak.
- To‘liq backend uchun npm dependency o‘rnatilgan ajratilgan muhit va haqiqiy DB/E2E tasdiqlari kerak.

**Xulosa:** 7 qaror ko‘rib chiqildi, 5 noyob qaror indeksga qo‘shildi. **82/185** manba izi, ammo production tayyorligi **tasdiqlanmagan**.
