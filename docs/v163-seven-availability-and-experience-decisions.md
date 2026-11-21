# USTARA v163 — #53–#59 qarorlar, muqobil qidiruv va ulanish holati

**Manba:** v162 ZIP. Asl `docs/USTARA_185_NAZORAT.csv` qaror reyestri saqlangan, oldingi migratsiyalar o‘zgartirilmagan. 2026-11-21.

## Yangilangan funksiyalar

### #54 — bekor qilingan yoki rad etilgan brondan keyin boshqa sartarosh topish

- `alternativeBarbersDiscoveryUrl` faqat `cancelled` yoki `rejected` bron uchun mijozga `/user/explore?type=barbers` sahifasini taklif qiladi.
- Mijozning Bronlar sahifasida rad etilgan/bekor qilingan bronning detallarida boshqa sartaroshlar qidiruvi mavjud. Bekor qilish muvaffaqiyatli serverdan tasdiqlangandan keyin ochiladigan muqobil vaqtlar bo‘limi ham boshqa sartarosh qidiruvini taklif qiladi.
- Havolaga mijoz ID, bron ID, avvalgi xizmat ID, telefon, token yoki maxfiy ma’lumot **uzatilmaydi**. Qidiruv mos xizmat, narx yoki bo‘sh vaqtni va’da qilmaydi.
- Yangi bronni yaratish **foydalanuvchining alohida amali**, qayta narx/slot tekshiruvi bilan. Oldingi bron avtomatik ko‘chirilmaydi. `confirmed`/`pending` bronlarga bu qidiruv taklifi bilan avtomatik bekor qilish ulanmagan.
- **QOLGAN:** aynan sartaroshning kela olmasligi hodisasidan keyingi tasdiqlangan xabarnoma, muqobil nomzodlar ro‘yxati, ekvivalent xizmatni va amaldagi slotni server tekshiruvi hamda mijoz roziligi bilan yangi bron yaratish end-to-end oqimi.

### #59 — ulanish uzilishi va qaytish holati

- Sayt bo‘ylab `ConnectionNoticeV163` foydalanuvchi qurilmasining offline/online brauzer signallariga qarab uch tildagi ogohlantirishni ko‘rsatadi.
- Ulanish qaytganda ogohlantirishni yopish mumkin; tizim hech qachon bron yaratish/tahrirlash/bekor qilish so‘rovini avtomatik qayta yubormaydi, serverdagi holatni qayta tekshirish kerakligi aytiladi.
- `navigator.onLine` faqat **qurilma signali**: u server ishlayotganining isboti emas. Xavfsiz yondashuv tufayli autentifikatsiya talab qiladigan API javoblari offline cache'ga joylanmaydi (`cache: no-store`).
- **QOLGAN:** offline statik sahifa shell'i, faqat ochiq resurslar uchun xavfsiz keshlangan kontent, brauzer E2E/real qurilmalardagi sinov. Bu versiya to‘liq offline ishlashni ta’minlamaydi.

## #53–#59 manba auditi va aniq cheklovlar

| # | Talab | Manba bo‘yicha holat |
|---|---|---|
| 53 | Xavfsiz bronlarni avtomatik tasdiqlash | Auto-confirm kodlari mavjud; real DB concurrency sinovi qolgan |
| 54 | Sartarosh kela olmasa muqobil takliflar | Bekor/rad etilgandan keyin tanlashga yo‘naltirish qo‘shildi; absence-driven workflow hali yo‘q |
| 55 | Ta’til va bronlar himoyasi | Kalendar o‘zgarishida mavjud bron konfliktiga 409/rollback; real DB parallel sinov qolgan |
| 56 | Tasdiqlangan bron narxi o‘zgarmaydi | Price/service snapshot unit izlari bor; barcha eski oqimlar va real DB hali verifikatsiya qilinmagan |
| 57 | Sartarosh aksiyalari va natijalari | Admin reklama mexanizmi mavjud; mustaqil sartarosh aksiyasi/chegirmasi va natija statistikasi **yo‘q** |
| 58 | Mobilga mos qoramtir-ko‘k dizayn | CSS manbalari va yangi moslashuvchan ulanish banneri mavjud; vizual va a11y E2E qolgan |
| 59 | Loading, xatolik, offline kesh | Loading/error UI mavjud, ulanish banneri qo‘shildi; offline cache hali yo‘q |

**Indeks:** 56/185 → **63/185**; 7 ta yangi noyob manba izi, **122 ta qaror hali indekslanmagan**. Bu foiz umumiy loyiha tayyorligini yoki ishlayotgan production holatini anglatmaydi. #49 apellyatsiya va #52 manzil snapshoti oldingi ochiq vazifa bo‘lib qolmoqda.

## Test va integratsiya holati

- Frontend Node unit: **1638/1638 PASS**, so‘nggi o‘zgartirishlardan keyin qayta sinov.
- Backend `test/*.unit.test.js`: **1566/1595 PASS, 29 FAIL**. 29 ta test bu muhitda o‘rnatilmagan `express`, `pg`, `jsonwebtoken`, `bcrypt` paketlariga bog‘liq; to‘liq backend suite **PASS emas**. `npm ci` bajarilmadi.
- Backend tanlangan #53–#59, kalendar, narx va promotion unit: **14/14 PASS**. Frontend tanlangan muqobil bron va yutuq testlari: **61/61 PASS**; yangi v163 testlarining frontend 4 va backend 2 tasi o‘tdi.
- O‘zgartirilgan 4 ta JSX fayl TypeScript `transpileModule` bilan **syntax parse PASS**. Bu render/bundle test o‘rnini bosmaydi.
- `node scripts/v67-migration-audit.cjs`: **49 forward / 2 rollback, OFFLINE_PASS**, real database migration **NOT_RUN**. v163 yangi SQL migratsiya qo‘shmadi.
- Haqiqiy PostgreSQL, Telegram, browser E2E, Vite production build, accessibility/device testing: **NOT_RUN**. Frontend/backend npm dependencies bu muhitda o‘rnatilmagan.
- Migration va asli reyestr baytma-bayt yaxlitligi arxiv yig‘ilishida alohida tekshirildi.

**Production readiness: NOT_VERIFIED.** Hech qanday real baza yoki deploymentga yozilmadi.

## Keyingi bosqich

v164 — asl 185 reyestrdagi #60–#66 qarorlar. #49, #52, #54 va #57 dagi ochiq xususiyatlar productionga chiqishdan oldin alohida yakunlanishi shart.
