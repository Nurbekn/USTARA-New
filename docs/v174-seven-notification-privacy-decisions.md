# USTARA v174 — #130–#136 Smart Notification Center va privacy/guest audit

**Asos:** v173 arxivi va `docs/USTARA_185_NAZORAT.csv` (SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`). Asl reyestr tahrirlanmagan. **137/185 ta qaror manba darajasida tekshirildi**, 48 ta qaror hali navbatda. Bu bajarilgan mahsulot ulushi emas.

## Yangi #131 funksiyasi — QISMAN

- Mijozning qo‘ng‘iroqcha oynasida **Barchasi / Faol / Yakunlangan** filtrlari hamda har bir filtr bo‘yicha **serverdan olingan** bron holatlari soni chiqariladi.
- Faqat haqiqiy autentifikatsiyalangan `/api/bookings` dan olinadigan ma’lumotlar ishlatiladi. `pending`, `confirmed` faollarga, `completed`, `cancelled`, `rejected` yakunlanganlarga ajratiladi. Eski `confirmed` bronni brauzer soatiga qarab o‘zimizcha `completed` qilmaymiz.
- **Yangilash** bosilganda serverga qayta murojaat qilinadi. Oyna yopilganda yoki akkaunt/sessiya almashganda eski so‘rov bekor qilinadi va eski ma’lumot tozalanadi. Eski akkaunt javobi yangi akkauntga ko‘rsatilmaydi.
- Natija uch tilda (UZ/RU/EN); bir ko‘rinishda 12 tagacha holat ko‘rsatiladi, qolganlarini Bronlar sahifasidan ochish mumkin.
- **Xabar yuborilgani yoki o‘qilgani haqida da’vo YO‘Q**: bu to‘liq Telegram/push/outbox tarix emas, bronning serverdagi hozirgi holati.
- Baza migratsiyasi, yangi bildirishnoma yuborish va bron statuslarini o‘zgartirish yo‘q.

## #130–#136 qarorlar holati

| # | Qaror | Manba holati |
|---|---|---|
| 130 | Boshqa sartaroshga rozilik bilan transfer | **YO‘Q**: rozilik, ikki sartarosh qulf/transaksiyasi va transfer oqimi ishlab chiqilmagan. |
| 131 | Smart Notification Center | **QISMAN**: serverdagi bron statusi filtrlari va refresh; haqiqiy event/push/Telegram tarixi yo‘q. |
| 132 | Faqat slot bo‘shasa bildirish waitlist | **QISMAN**: Smart Booking queue offer asoslari bor, ammo alohida aniq slot waitlist’i isbotlanmagan. |
| 133 | Smart Booking History | **QISMAN**: bronlar tarixi bor, ammo Smart Booking offer/decisionlarning to‘liq o‘zgarmas event tarixi yo‘q. |
| 134 | Privacy Center | **YO‘Q**: umumiy privacy/export/ruxsat/ma’lumot o‘chirish markazi hali yo‘q. |
| 135 | Akkauntni vaqtincha faolsizlantirish | **QISMAN**: parol/session talablari uchun kod bor, real PG va boshqa integratsiyalar tekshirilmagan. |
| 136 | Mehmon rejimi va vaqtincha tanlovlar | **QISMAN**: 5 daqiqalik browser-tab booking draft va ommaviy browsing manbalari bor, to‘liq browser E2E yo‘q. |

## Tekshiruvlar

- **Frontend to‘liq Node unit**: **1676/1676 PASS**.
- **Backend to‘liq Node unit**: **1650/1679 PASS**, **29 FAIL** — 29 ta muvaffaqiyatsiz test **v173 bilan nomma-nom bir xil** (muhitdagi npm dependency cheklovi). Ushbu xatolar bartaraf etildi deyilmadi.
- v174 yangi frontend (5 test) va audit backend (2 test): **7/7 PASS**.
- O‘zgargan JSX/JS fayllarning TypeScript parser sintaksis tekshiruvi PASS; audit chiqishi PASS.
- **PostgreSQL**, haqiqiy Telegram, **browser E2E**, production build: **NOT_RUN**. Loyihaning productionga tayyorligi tasdiqlanmagan.
- v173 ning 1350 ta fayli saqlangan; eski SQL va asosiy 185 reyestr baytma-bayt o‘zgarmagan. Batafsil: `docs/v174-integrity-report.json`.

**Keyingi bosqich:** v175 — #137–#143. Bu bosqichdagi qisman/yo‘q qarorlar keyingi ishlab chiqish navbatida qoladi. 185 ta manba auditi ham loyiha to‘liq bitdi degani emas.
