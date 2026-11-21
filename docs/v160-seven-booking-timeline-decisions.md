# USTARA v160 — #32–#38 source audit va rangli bron timeline

**Asos:** v159 ZIPdagi to'liq USTARA-New loyiha papkasi. Dastlabki 185 ta qaror reyestri `docs/USTARA_185_NAZORAT.csv` o'zgartirilmadi (SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`). #32–#38 qarorlari asl reyestrdan ketma-ket olindi. **Source trace production sertifikati emas.**

## v160 da haqiqatan yozilgan funksionallik (#36)

- Sartaroshning **Bronlar** sahifasiga `BookingDayTimelineV160` o'qish uchun mo'ljallangan vertikal, holatga qarab rangli kunlik timeline qo'shildi; avvalgi `BookingCard` amallari o'zgarishsiz qoldi.
- Tashkent (`Asia/Tashkent`, UTC+5) kuni bilan ochiladi. Avvalgi/keyingi kun, sanani tanlash va bugunga qaytish mavjud. Bronlarning besh holati **matn bilan ham** ajratiladi: pending, confirmed, completed, cancelled, rejected.
- Timeline ma'lumotni **sartarosh hisobining mavjud autentifikatsiyalangan bronlar store'idan** oladi, alohida public API ochilmagan. `loading/error` paytida eski timeline kartalari ko'rsatilmaydi; u bronlarni avtomatik tasdiqlamaydi.
- Sof `buildBookingTimeline` qiymatlarni vaqt/ID bilan saralaydi, sanani qat'iy tekshiradi, takroriy ID/noto'g'ri soat/davomiylik/holatni filtrlab ogohlantiradi. Yarim tundan o'tgan tugash vaqti belgilab ko'rsatiladi. UTF nazorat belgilariga ega noto'g'ri label'lar zaxira labelga almashtiriladi; React text escapeni saqlaydi.
- Mobil ekran uchun maxsus CSS, klaviatura bilan boshqariladigan tugma/date input va `aria-label`/holat yorliqlari qo'shildi. O'zbek, rus va ingliz tarjimalari ajratildi.

**Eslatma:** Timeline vizual tartib uchun. Ranglarning o'zi bron vaqtining haqiqatan bandligini isbotlamaydi, masalan pending/cancelled slot tasdiqlangan bandlik emas. Vaqt bloki bo'yicha 24 soatli mutanosib piksel-grid qo'shilmagan; ustma-ust bronlar hozir ro'yxatdagi vaqt tartibida ko'rsatiladi, booking concurrency algoritmi o'zgartirilmagan.

## Etti noyob qarorning dalil holati

| # | Asl qaror | v160 holati |
|---|---|---|
| 32 | Navbatni qo'lda o'zgartirish | Mavjud reorder API/UI dalili va unit test bor; haqiqiy DB race + mobil E2E qolgan. |
| 33 | Navbat tartibi sababi va audit | Mavjud reorder reason audit jadvali va controller dalili; real DB rollback E2E qolgan. |
| 34 | Ish kunining oxirida navbat himoyasi | Mavjud QR/open-hours va day-close check, unit test; yarim tun DB race qolgan. |
| 35 | Mijozga navbat soni va taxminiy vaqt | Mavjud public ETA API/UI, unit test; bu vaqt **taxminiy**, real DB/brauzer tekshiruv qolgan. |
| 36 | Vertikal rangli bron timeline | **Yangi read-only UI**, sof model, 3 tildagi matn, 8 unit test; brauzer E2E qolgan. |
| 37 | Bronlarim kelajak va tarix | Mavjud customer booking filtrlari/UI va unit test; browser/DB E2E qolgan. |
| 38 | Kuzatilgan sartaroshlar Home boshida | Mavjud followed-first Home bo'limi va identity validation; auth browser E2E qolgan. |

Har bir qarorning aniq source/test manzili va qoldiq xavflari `docs/v160-seven-timeline-source-evidence.json` ichida. **35 + 7 = 42/185** noyob source trace; **143 ta** hali indekslanmagan. Oldingi #18 avtomatik eslatmalar va #22 erta tugagan xizmatdan qolgan vaqtni qayta taqsimlash ochiq qoladi.

## Haqiqiy tekshiruv natijalari

- Frontend barcha node unit: **1628/1628 PASS**, 0 fail (v160 8 ta yangi test bilan).
- Backend v160 audit unit: **5/5 PASS**.
- Backend tanlangan navbat/QR/ETA/oldingi source audit/v160 audit sinovlari: **46/47 PASS, 1 FAIL**. `walkinQr.unit.test.js` eski route-import testi ushbu muhitda `express` moduli topilmagani uchun yuklanmadi. Shu sabab mazkur umumiy backend tanlanma **PASS EMAS**.
- `frontend/scripts/v153-source-graph.mjs`: **PASS_SOURCE_GRAPH_ONLY**, Vite build emas.
- `frontend/scripts/v152-build-doctor.mjs`: source/lock preflight **PASS**, Vite build emas.
- `backend/scripts/v160-seven-timeline-decisions.mjs --json`: **42/185 source-only PASS**, `--require-production` ataylab rad etadi.

**Bajarilmagan:** haqiqiy PostgreSQL integratsiya/race test, real Telegram, brauzer E2E va Vite production build. npm dependency paketlari ushbu sinov muhitida o'rnatilmagan. 49 ta mavjud SQL fayli (47 forward va 2 rollback) o'zgartirilmadi va real DBga qo'llanmadi. Production tayyorligi **tasdiqlanmagan**.

## Keyingi bosqich

v161 da #39–#45 qarorlarni asl CSVdan olib, har biri uchun kod/test dalillarini tekshirish, yetishmayotgan eng muhim funksiyani yozish va regressiya sinovlarini bajarish. Avvalroq ochiq qolgan #18 va #22 ustida alohida real DB/worker sinovi talab etiladi.
