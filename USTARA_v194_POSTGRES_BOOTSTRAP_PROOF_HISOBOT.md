# USTARA v194 — PostgreSQL bootstrap-dan keyingi dalilli tekshiruv

## Bajarilgan ish

- v193 asosidagi qo'lda ishga tushadigan GitHub Actions workflow-ga **v194 bootstrap proof** bosqichi qo'shildi: SQL bootstrap'dan keyin, bron concurrency testidan oldin.
- `backend/scripts/v194-bootstrap-proof.cjs`: haqiqiy test DB-ga ulanadigan, biroq **faqat o'qiydigan** tekshiruvchi. Nom, schema, `ustara_account_test` rol huquqlari, 63 ta forward migration markerlari, mijoz va sartarosh vaqt to'qnashuvi constraintlari, check-in va mijoz Telegram jadvallari tekshiriladi.
- Qo'shimcha offline gate testlari va `npm run test:v194:unit`, `npm run v194:db:proof` buyruqlari.
- `backend/POSTGRES_V194_BOOTSTRAP_PROOF.md`: xavfsizlik chegaralari va GitHub'da qanday ishga tushirish yo'riqnomasi.

## Haqiqatan o'tkazilgan sinovlar

| Sinov | Natija |
|---|---|
| v194 yangi offline testlari | 9/9 PASS |
| v192–v194 tanlangan offline testlar | 20/20 PASS |
| Bootstrap manbalarining offline rejasi | PASS (63 forward migration, SQL bajarmasdan) |
| Frontend to'liq unit-testlari | 1739/1739 PASS |
| Backend to'liq unit-testlari | 1799/1828 PASS |
| Backend o'tmagan testlar | 29 ta, v193 bilan aynan bir xil; muhitdagi npm paketlari yetishmaydi |
| Real PostgreSQL bootstrap va v194 catalog proof | **NOT RUN** |
| Real PostgreSQL booking concurrency | **NOT RUN** |
| Telegram E2E va production build | **NOT RUN** |

Muhim: `backend/test`ni loyiha ildizidan ishga tushirish bilan v193 loglaridagi `test/...` yo'llari `backend/test/...` ko'rinishida chiqadi; testlarning nomlari bo'yicha solishtirilganda 29 ta o'zgarmagan.

## O'zgarmagan tizimlar

Asl 185 qaror reyestri, barcha SQL migratsiya fayllari, foydalanuvchi bronlari, Telegram tokenlari va boshqa production ma'lumotlari o'zgarmagan. Hech qanday haqiqiy bazaga ulandik, migratsiya qo'lladik yoki xabar yubordik degan da'vo qilinmaydi.

**185/185 manba auditi** ilgari tugagan, ammo real backend dependencies, PostgreSQL, brauzer va Telegram staging sinovlari o'tmaguncha **LOYIHA TUGADI** deb belgilab bo'lmaydi.
