# USTARA v161 — #39–#45 chat va reklama/Admin qarorlari manba auditi

**Asos:** v160 to‘liq ZIP loyihasidan davom etildi. Asl 185-qarorli `docs/USTARA_185_NAZORAT.csv` o‘zgartirilmadi (SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`). **Manba auditi ishlab chiqarishga tayyorlik sertifikati emas.**

## Yangi funksiyalar: mijoz – sartarosh shaxsiy chat asoslari (#39–#41)

- Xavfsiz chat uchun `customer_barber_chat_threads` va `customer_barber_chat_messages` jadvallari qo‘shildi (`backend/database/migrations/20261219_customer_barber_chat.sql`). Bu **48-forward migratsiya**; avvalgi 47 ta forward va 2 ta rollback SQL faylini o‘zgartirmaydi. Migratsiya **haqiqiy PostgreSQL bazasida ishga tushirilmagan**. Deploy paytida mas'ul operator tomonidan oldin bajarilishi kerak.
- Backend `/api/chat/threads`, `/api/chat/threads/:threadId/messages` endpointlari JWT autentifikatsiya, customer/barber rolini tekshirish, threadga faqat ikki qatnashchi ruxsati, faqat tasdiqlangan sartarosh, transaction va `FOR UPDATE` yozish himoyasi bilan qo‘shildi.
- Xabar manbasi backend tomonidan `human` deb belgilanadi. `isAi`, `source`, `senderKind` ni klient soxtalashtira olmaydi. AI javob generatori **qilinmagan**; AI belgisi kelgusi imkoniyat uchun mo‘ljallangan.
- Tasdiqlangan sartaroshning ochiq ijtimoiy postini chatga biriktirish mumkin. Post keyin o‘chirilsa post-only xabar bo‘sh qolmasligi uchun saqlanadigan zaxira matn bor. 1000-belgi chegarasi va bir foydalanuvchi/thread bo‘yicha 2 soniya oralig‘i tekshiriladi; bu global spamlardan kompleks himoya emas.
- Mijoz va sartarosh kabinetlariga `/user/chat`, `/barber/chat` sahifalari ulandi; profil, feed postlari va dashboard orqali havolalar qo‘shildi. Xabarlar **6 soniyalik polling** orqali yangilanadi; bu **WebSocket yoki haqiqiy push real-time emas**. Sartarosh uchun 3 tilda **3 ta tayyor odam javobi** qo‘shildi. UI mijozning bron qilish tugmasini almashtirmaydi.
- Alohida `chatModelV161.js` so‘rovlar va xabarlar strukturasini tekshiradi. Avvalgi akkaunt ma’lumotlari yangi sessiyada ko‘rsatilmasligi uchun session identity + abort ishlatiladi; dastlabki thread yaratilgandan keyin inbox qayta yuklanadi.

## #39–#45 qarorlarning manba holati

| # | Asl qaror | Real holat |
|---|---|---|
| 39 | Real-time chat va post ulashish | Yangi shaxsiy chat REST, 6s polling, post link; **haqiqiy real-time yo‘q**; PostgreSQL va browser E2E qolgan. |
| 40 | Chat tezkor javoblar va keyingi AI | 3 tilda tayyor sartarosh javoblari; **AI integratsiya qilinmagan**. |
| 41 | AI va odam chatini farqlash | Server `human` ni majburan saqlaydi, UI manbani ko‘rsatadi; AI xabar yuboruvchi mexanizm yo‘q. |
| 42 | Profil bron qilish tugmasining ustuvorligi | Oldindan mavjud profildagi asosiy booking CTA manbasi va testi topildi; mobil E2E qolgan. |
| 43 | Belgilangan reklamalar, onlayn to‘lovsiz | Oldindan mavjud sponsor yorlig‘i va reklama boshqaruvi; haqiqiy kampaniya E2E qolgan. |
| 44 | Admin reklama kampaniya boshqaruvi | Oldindan mavjud admin reklama API/paneli; DB integratsiya va billing tekshiruvlari qolgan. |
| 45 | Sartarosh tasdiqlanishi Admin orqali | Oldindan mavjud tasdiqlash API/paneli; end-to-end role/audit tekshiruvlari qolgan. |

Manba/test fayllarining aniq ro‘yxati `docs/v161-seven-chat-advertising-source-evidence.json`da. **42 + 7 = 49/185** noyob indeks; yana **136 ta qaror** indekslanmagan. Har 7 qaror `PARTIAL_SOURCE_GAP`; to‘liq tugallangan deb e'lon qilinmaydi. Oldingi #18 avtomatik eslatmalar va #22 vaqtni qayta taqsimlash muammolari ham ochiq.

## Tekshiruvlar

- Frontend barcha Node unit testlari: **1631/1631 PASS**.
- Backend yangi chat, #39–#45, ilgari bor queue/reklama/migratsiya/oldingi audit regressiya tanlanmasi: **64/64 PASS**.
- Backend **to‘liq** unit-testlar: **1550/1579 PASS**, **29 ta FAIL**; npm kutubxonalari (`express`, `pg`, `jsonwebtoken`, `bcrypt` va ularga bog‘liq modul importlari) ushbu muhitda mavjud bo‘lmaganligi bilan bog‘liq. **To‘liq backend suite PASS emas**.
- TypeScript transpiler yordamida o‘zgargan asosiy 8 frontend JSX/JS modul sintaksisi xatosiz parse bo‘ldi; bu Vite build yoki browser E2E o‘rniga o‘tmaydi.
- `node scripts/v67-migration-audit.cjs`: **48 forward/2 rollback, OFFLINE_PASS** (fayllar/manifest). Migratsiya **real DBda bajarilmadi**.
- `node backend/scripts/v161-seven-chat-advertising-decisions.mjs`: **49/185 source references**, `productionReady:false`.
- Frontend v152 build-doctor preflight **PASS**; v153 source-graph **PASS_SOURCE_GRAPH_ONLY**, Vite production build bajarilmagan.

**Hali bajarilmagan:** PostgreSQL integration, izolyatsiya/ko‘p foydalanuvchili race, brauzer E2E, autentifikatsiyalangan API integration, real Telegram, WebSocket, production build, deployment. **Production-ready: TASDIQLANMAGAN.**

## Keyingi bosqich

v162 — #46–#52 qarorlarni aniq CSV talablariga qarab kod va test bilan tekshirish. Oldingi versiyalardagi ochiq xavflarni yo‘q deb hisoblamaslik.
