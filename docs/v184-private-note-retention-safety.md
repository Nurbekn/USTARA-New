# USTARA v184 — #179 maxfiy bron qaydlarining retention tozalash xavfsizligi

## Asos va maqsad

v182 versiyada bronning sartaroshga tegishli maxfiy qaydi 90 kunlik `expires_at` muddati bilan saqlanadi. O‘qish va yozish API-lari muddati tugagan qaydni ko‘rsatmaydi, ammo bazadan jismoniy tozalash uchun eski `v182-prune-private-notes.cjs` skripti cheklanmagan `DELETE` ishlatar edi. v184 shu operatsiyani alohida, nazoratli va chegaralangan servisga almashtirdi.

Bu **faqat** `booking_private_notes` jadvalidagi muddati o‘tgan qaydlar uchun. Chatlar, portfolio, boshqa bron ma’lumotlari, backup nusxalari yoki butun akkaunt ma’lumotlarini o‘chirish siyosati emas.

## Kiritilgan o‘zgarishlar

- `backend/services/privateNoteRetentionV184.js`: PostgreSQL tranzaksiyasi ichida oldindan tekshirish va 1–500 satrli partiyalarda tozalash. `DELETE ... WHERE expires_at <= clock_timestamp()` va `FOR UPDATE SKIP LOCKED` ishlatiladi. Qayd matni, booking ID yoki mijoz identifikatori servis javobiga qaytarilmaydi.
- `backend/scripts/v182-prune-private-notes.cjs`: mavjud nom saqlandi, lekin CLI xavfsizlashtirildi. **Standart rejim `DRY_RUN`**, DB darajasida `BEGIN READ ONLY`. O‘chirish faqat `--execute` va `--acknowledge-private-note-retention` birgalikda berilsa mumkin.
- Baza nomi va schema **har doim** `--database=...` va `--schema=...` orqali aniq ko‘rsatilishi kerak. Ular serverdagi `current_database()` va `current_schema()` bilan bir xil bo‘lmasa hech qanday o‘chirish bajarilmaydi. Superuser ulanishi va migratsiyasiz schema rad etiladi.
- Ikkita bir vaqtdagi worker uchun advisory transaction lock; har bir ishning `lock_timeout`, `statement_timeout` va batch limiti bor. Qulflangan yoki o‘chirish natijasi noma’lum bo‘lsa, avtomatik retry yo‘q.
- Satr matnini loglash yoki web request ichida avtomatik tozalash yo‘q. Faqat quruq sanash natijasi yoki o‘chirilgan satrlar soni qaytadi.

## Operator tartibi — faqat review va ruxsatdan keyin

**Ushbu bosqichda hech qanday DBga ulanilmadi va birorta qayd o‘chirilmadi.** Productionga `--execute` bilan ishga tushirishdan avval DB administratori: retention siyosati, audit/log siyosati, backup va tiklash sinovi, connection roliga faqat zarur `SELECT`/`DELETE` huquqi, schema/migratsiya mavjudligi, backup nusxalarining saqlash muddatini tasdiqlashi kerak. `DATABASE_URL` maxfiy konfiguratsiyadan olinadi, terminal history yoki repo ichiga joylanmaydi.

Operator o‘zi aniq tasdiqlagan `DB_NAME` va `SCHEMA_NAME` qiymatlariga almashtirib quyidagi **faqat hisoblovchi** buyruqni ishlatishi mumkin:

```bash
cd backend
node scripts/v182-prune-private-notes.cjs --database=DB_NAME --schema=SCHEMA_NAME --limit=100 --dry-run
```

Bu bosqichni bajarish uchun `DATABASE_URL` oldindan xavfsiz o‘rnatilgan bo‘lishi zarur. `DRY_RUN` natijasi `dueCount`ni **matn** sifatida qaytaradi, o‘chirmaydi.

Faqat alohida operator roziligi va restore tekshiruvidan keyin quyidagi **haqiqiy o‘chirish** buyrug‘i qo‘llanadi (o‘zi hozir ishga tushirilmagan):

```bash
cd backend
node scripts/v182-prune-private-notes.cjs --database=DB_NAME --schema=SCHEMA_NAME --limit=100 --execute --acknowledge-private-note-retention
```

`PURGED` javobi aynan shu batchda o‘chirilgan satrlar sonini qaytaradi. `batchLimitReached=true` qolgan satrlar borligini **isbotlamaydi**: keyingi quruq hisob bilan tekshiriladi. `COMMIT` javobi noma’lum bo‘lsa, avtomatik takror yubormasdan yana `DRY_RUN` orqali holatni aniqlash kerak. `Cron`, `systemd timer`, hosting scheduler yoki CI avtomatik o‘chirish **o‘rnatilmagan**; buning uchun alohida deploy va operator tasdig‘i kerak.

## Test natijalari va cheklovlar

- `node --test backend/test/v184PrivateNoteRetention.unit.test.js` — 10/10 PASS (xotiradagi PG adapter yordamida).
- PostgreSQL real RLS/rol, advisory locking, batch va `COMMIT` uzilish integratsiya sinovlari **bajarilmagan**.
- 185 qarorning manba auditi 185/185 bo‘lib qoladi. Bu production tayyorligi emas.
- #160/#176 telefon orqali manual booking, #177 Admin suspension, #110–#122 shop jamoasi, #175 shopni xavfsiz yopish, #134 Privacy Center va boshqa E2E tekshiruvlar hali ochiq.
