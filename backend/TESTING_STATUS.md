# Backend test status reyestri

Bu hujjat testlarning tarixiy reyestridir. Avvalgi natijalar o‘chirilmaydi; qayta bajarilgan testlar alohida yoziladi. Maxfiy sozlamalar va ulanish qiymatlari bu yerga kiritilmaydi.

## 1. Bajarilgan testlar

| Test / tekshirilgan funksionallik | Sana | Natija | Testlar soni | Muhit / database | Turi | Izoh |
|---|---|---:|---:|---|---|---|
| `node test/databasePoolConfig.unit.test.js` — production/test URL ajratilishi, test DB guard’i, host/schema tekshiruvi, TLS va Telegram worker pool siyosati | 2026-11-15 | PASS | 7 | Unit/config; DB ulanmagan | Yangi regression suite | Test konfiguratsiyalari xotirada tekshirildi. |
| `node --test test/databasePoolConfig.unit.test.js` — yuqoridagi regression suite’ni `--test` bilan ishga tushirish | 2026-11-15 | SKIP / hisobga olinmadi | 0 ta haqiqiy test | DB ulanmagan | Takroriy ishga tushirish | Node chiqishi test faylini wrapper sifatida ko‘rsatib, 0 ta ichki test hisoblagan. Haqiqiy natija bevosita `node test/databasePoolConfig.unit.test.js` ishga tushirishidan olindi. |
| `node --test test/api.integration.test.js` — API integration | 2026-11-15 | SKIP / hisobga olinmadi | 0 ta haqiqiy test | DB ulanmagan | Mavjud integration suite | `--test` chiqishi 0 ta ichki testni ko‘rsatgan; bevosita ishga tushirish pastda qayd etilgan. |
| `node test/api.integration.test.js` — API integration testining o‘zi | 2026-11-15 | SKIP | 1 | Kutilgan target: `ustara_test_db`; ulanmagan | Mavjud regression suite | Owner va app test URL o‘zgaruvchilari yo‘qligi sabab test skip bo‘ldi. |
| `node test/authPolicy.unit.test.js` — frontend/backend telefon va parol qoidalari, `users.phone` schema/migration yagonaligi | 2026-11-15 | FAIL | 2: 1 PASS, 1 FAIL | Unit/statik fayl tekshiruvi; DB ulanmagan | Yangi regression suite | Test regex’i SQL’dagi quote escaping’ni noto‘g‘ri kutgan. Keyingi bajarishda tuzatildi. |
| `node test/authPolicy.unit.test.js` — yuqoridagi suite qayta tekshiruvi | 2026-11-15 | PASS | 2 | Unit/statik fayl tekshiruvi; DB ulanmagan | Takroriy regression | Telefon/parol mosligi va schema/migration statik tekshiruvi o‘tdi. |
| `node test/registration.unit.test.js` — registration, parol chegaralari, parallel telefon ro‘yxati, OTP/JWT/router | 2026-11-15 | FAIL | 21: 20 PASS, 1 FAIL | In-memory/mock; DB ulanmagan | Mavjud suite’ga regression holatlari qo‘shildi | JWT test so‘rovlarida HTTP metodi noto‘g‘ri berilgan. Keyingi bajarishda tuzatildi. |
| `node test/registration.unit.test.js` — yuqoridagi suite qayta tekshiruvi | 2026-11-15 | PASS | 21 | In-memory/mock; DB ulanmagan | Takroriy regression | Parallel customer/barber registration, profile identity, role va JWT muddat tekshiruvlari o‘tdi. |
| `node test/loginProtection.unit.test.js` — account/IP rate limit, parallel urinishlar, admin faolligi va login | 2026-11-15 | PASS | 11 | In-memory/mock; DB ulanmagan | Mavjud suite’ga regression holati qo‘shildi | 128 belgidan uzun eski parol bilan login ham tekshirildi. |
| `node test/loginProtection.unit.test.js` — generic xato javobi assertion’i bilan qayta tekshiruv | 2026-11-15 | PASS | 11 | In-memory/mock; DB ulanmagan | Takroriy regression | Mavjud va topilmagan account uchun xavfsiz xato javobi qamrab olindi. |
| `node test/registration.test.js` — frontend registration oqimi, canonical telefon va parol qoidalari | 2026-11-15 | FAIL | 9: 8 PASS, 1 FAIL | Mock fetch/browser storage; DB ulanmagan | Mavjud suite’ga regression holatlari qo‘shildi | Raqamli parol namunasi common-password ro‘yxatiga ham tushgani uchun test noto‘g‘ri xabar kutgan. Keyingi bajarishda tuzatildi. |
| `node test/registration.test.js` — yuqoridagi suite qayta tekshiruvi | 2026-11-15 | PASS | 9 | Mock fetch/browser storage; DB ulanmagan | Takroriy regression | Registration telefonni yuborishdan oldin canonical formatga o‘tkazishi va parol chegaralari tekshirildi. |
| `node test/login.test.js` — frontend login, telefon normalizatsiyasi va uzun eski parol | 2026-11-15 | PASS | 8 | Mock fetch; DB ulanmagan | Mavjud suite’ga regression holatlari qo‘shildi | Login yangi registration parol chegarasini qo‘llamasligi tasdiqlandi. |
| `node test/bookings.unit.test.js` — booking, availability, davomiylik, ruxsatlar, status, mock rollback | 2026-11-15 | PASS | 17 | In-memory/mock; DB ulanmagan | Mavjud suite, regression tekshiruvi | Parallel holatlar simulyatsiya qilingan; bu haqiqiy PostgreSQL sinovi emas. Ikki kutilgan injected storage xatosi test ichida yuz berdi. |
| `node test/local-booking.integration.test.js` — haqiqiy PostgreSQL booking oqimlari | 2026-11-15 | SKIP | 1 suite; 0 ichki scenario bajarildi | Kutilgan target: `ustara_test_db`; ulanmagan | Mavjud PostgreSQL integration suite’ga yangi exclusion testi qo‘shildi | Opt-in yoqilmagan va `USTARA_TEST_DATABASE_URL` mavjud emas edi. Shu sababli yangi bevosita exclusion `23P01` regression testi ham bajarilmadi. |
| `local-booking.integration.test.js` — PostgreSQL exclusion, rollback va parallel booking (xavfsiz preflight) | 2026-11-15 | SKIP; test ishga tushirilmadi | 0 | Database ulanmagan | Mavjud suite uchun qayta urinish; preflight | `USTARA_LOCAL_BOOKING_WRITE_TESTS` opt-in’i va `USTARA_TEST_DATABASE_URL` yo‘q. Shu sababli URL’dagi database/session user’ni tekshirib bo‘lmadi va helper guard’i orqali testni boshlash xavfsiz emas edi. |
| `node --test test/local-booking.integration.test.js` — PostgreSQL booking integration setup | 2026-11-15 | FAIL (foydalanuvchi taqdim etgan natija) | 0 scenario; connection setup muvaffaqiyatsiz | PostgreSQL target tasdiqlanmagan; test natijasida database identity o‘qilmagan | Mavjud integration suite’ni takroriy regression tekshiruvi | `log_parameter_max_length` startup option’ini o‘rnatishda permission denied. Parametr test uchun shart emas; keyingi patchda olib tashlandi. Qayta test joriy shell’da test URL va opt-in yo‘qligi sababli bajarilmadi. |
| `node --test test/local-booking.integration.test.js` — PostgreSQL booking harness tayyorlash | 2026-11-15 | FAIL (foydalanuvchi taqdim etgan natija) | 0 scenario; setup to‘xtagan | Database va role mustaqil tasdiqlanmagan | Mavjud integration suite’ni takroriy regression tekshiruvi | `42501` aniq xabar bilan berilmagan. Static auditdagi eng ehtimoliy sabab `current_setting('data_directory')`: bu protected server sozlamasi va oddiy test role’ga `pg_read_all_settings` kerak bo‘lishi mumkin. Helper bu ma’lumotni endi so‘ramaydi; ortiqcha keng huquq berish o‘rniga local cluster tekshiruvi versiya/port bilan saqlandi. Test qayta bajarilmadi. |
| `node --test test/local-booking.integration.test.js` — public baseline va jadval huquqlari | 2026-11-15 | FAIL (foydalanuvchi taqdim etgan real PostgreSQL natijasi) | 0 scenario; `public.users` baseline SELECT’da to‘xtagan | Xabarda test bazasi `ustara_test_db` deb ko‘rsatilgan; current session role mustaqil tekshirilmagan | Mavjud integration suite’ni takroriy regression tekshiruvi | `42501 — permission denied for table users`. `ustara_test_owner` uchun privilege audit terminalda `USTARA_TEST_DATABASE_URL` yo‘qligi sabab bajarilmadi. Faqat SELECT audit SQL’i tayyorlandi; huquq o‘zgartirilmadi va test qayta ishlatilmadi. |
| `node test/diagnose-local-booking-privileges.js` — public table/sequence privilege auditi | 2026-11-15 | SKIP; diagnostika ishga tushirilmadi | 0 | Database ulanmagan | Yangi read-only diagnostika skripti | Skript yaratildi, lekin joriy terminalda `USTARA_TEST_DATABASE_URL` yo‘q. PostgreSQL role/table/sequence privilege’lari hali aniqlanmagan. |
| Local booking integration — `create stores snapshot and canonical Tashkent instant; linked notification sees committed row` | 2026-11-16 | FAIL | 3 oldingi scenario PASS; ushbu scenario FAIL | Haqiqiy PostgreSQL; report identity `ustara_test_db`, local PostgreSQL 18.6 | Mavjud integration suite regression sinovi | Safe report’da POST javobi HTTP 500 va body xabari `Serverda xatolik yuz berdi`; server log faqat `backend_error` deb saqlangan, asl PG matni yo‘q. Amaldagi test grant skripti `barbers` UPDATE huquqini bermagan, controller esa `SELECT ... FOR SHARE` qiladi; bu konfiguratsiyadagi aniq privilege kamchiligi, lekin avvalgi run’ning xom PG xabari yo‘qligi sabab runtime log bilan alohida tasdiqlanmagan. Cleanup `own_rows_removed=true`, `original_rows_unchanged=true`; test yozuvlari tozalangan. Qayta test bajarilmadi. |
| Local booking integration — `PostgreSQL exclusion constraint independently rejects an overlapping direct insert` | 2026-11-16 | FAIL | Foydalanuvchi bergan natija: 8 PASS, ushbu scenario FAIL | Haqiqiy PostgreSQL; saqlangan report identity `ustara_test_db`, 18.6 | Mavjud exclusion regression sinovi | Report’da scenario assertion yiqilgani bor, ammo direct INSERT’ning SQLSTATE/xabari va `pg_constraint` qiymatlari yozilmagan. Cleanup `own_rows_removed=true`, `original_rows_unchanged=true`, `schema_unchanged=true`, `history_unchanged=true`. Joriy shell’da `USTARA_TEST_DATABASE_URL` yo‘q va registered PG18 cluster ishlamayapti; read-only katalog tekshiruvi shu sabab bajarilmadi. Test endi keyingi run uchun constraint katalogi, xavfsiz INSERT xatosi va fixture overlap faktlarini report’ga yozadi. |
| Local booking integration — migration va test-only privilege o‘zgarishlaridan keyingi yakuniy rerun | 2026-11-16 | PASS | 21: 21 PASS, 0 FAIL, 0 SKIP; 4914.837675 ms | Foydalanuvchi bergan real PostgreSQL natijasi; faqat `ustara_test_db` | Yakuniy integration rerun | Barcha 21 scenario, jumladan availability, booking/duration, exclusion constraint, parallel status/booking, Telegram confirm/reject, eskirgan/foreign/spoofed callback himoyasi va transport xatosi muvaffaqiyatli. `20261115_slots_02_booking_no_overlap.sql` `ustara_test_db`da muvaffaqiyatli bajarilgan; constraint valid, GiST index valid/ready/live. Foydalanuvchi ma’lumotiga ko‘ra `users.created_at` va `barber_telegram_links.linked_at` uchun ustun darajasidagi UPDATE huquqi faqat shu database ichida qo‘shilgan. |
| Tegishli JS fayllar uchun `node --check` | 2026-11-15 | PASS | Test emas; 11 ta auth fayli va 6 ta booking fayli | DB ulanmagan | Statik tekshiruv | Sintaksis tekshiruvlari o‘tdi. |
| `git diff --check` | 2026-11-15 | PASS | Test emas | DB ulanmagan | Statik tekshiruv | Tracked diff toza; untracked booking integration test uchun alohida whitespace tekshiruvi ham PASS. |
| `node test/bootstrap-plan.unit.test.js` | 2026-11-16 | PASS | 6 | Offline/static; DB ulanmagan | Yangi migration include tartibi va predecessor tartib regressiyasi | 12 migration ro‘yxati va xato tartib/duplikat/rollback/schema include holatlari tekshirildi. |
| `node test/bootstrap-plan.unit.test.js` — integrity migration catalog-check tuzatishidan keyingi qayta tekshiruv | 2026-11-16 | PASS | 6 | Offline/static; DB ulanmagan | Migration tartibi regression | Yangi forward migration bootstrap tartibida qolishi va rollback/schema shortcut kiritilmagani qayta tekshirildi. |
| `node test/registration.unit.test.js` | 2026-11-16 | PASS | 21 | In-memory/mock; DB ulanmagan | Registration regression | OTP, transaction modeli, profile yaratish va mavjud registration flow qayta tekshirildi. |
| `node test/loginProtection.unit.test.js` | 2026-11-16 | PASS | 11 | In-memory/mock; DB ulanmagan | Login limiter regression | Account/IP hash namespace va lock tartibi tekshirildi. |
| `node test/bookings.unit.test.js` | 2026-11-16 | PASS | 17 | In-memory/mock; DB ulanmagan | Booking/schedule regression | Booking overlap/status va schedule advisory lock testi o‘tdi; PostgreSQL concurrency isboti emas. |
| `node test/telegram.unit.test.js` | 2026-11-16 | PASS | 9 | In-memory/mock; DB ulanmagan | Telegram link lock-order regression | Barber row’ni user row’dan oldin lock qiladigan aniq service tartibi mock bilan tekshirildi; PostgreSQL concurrency isboti emas. |
| Tegishli JS uchun `node --check`; `git diff --check` | 2026-11-16 | PASS | Test emas | DB ulanmagan | Sintaksis/format statik tekshiruv | Yangi service, controller, migration test harness va yangilangan test JS sintaksisi toza. |
| Yakuniy `node --check` (o‘zgargan JS/integration suites) va `git diff --check` | 2026-11-16 | PASS | Test emas | DB ulanmagan | Yakuniy statik tekshiruv | Account deletion service, controllers, service/Telegram write flows, ikki yangi integration suite va harness sintaksisi; tracked diff whitespace tekshirildi. |

Izoh: ushbu faylning yangilashdan oldingi holatida 18-testlik aggregate natija alohida qayd etilmagan. Mavjud eski FAIL/SKIP yozuvlari va 17 ta unit testning PASS natijasi saqlandi; mavjud bo‘lmagan 18-test tafsilotlari taxmin bilan kiritilmadi.

## 2. Bajarilishi kerak bo‘lgan testlar

- `account-profile-integrity.integration.test.js` va `admin-account-deletion.integration.test.js` yozildi, ammo **NOT RUN**. Ikki suite ham faqat `USTARA_ACCOUNT_INTEGRITY_TESTS=I_AUTHORIZE_TEST_DATABASE` va valid local `USTARA_TEST_DATABASE_URL` bo‘lgandagina test-owned schema yaratadi.
- `bootstrap-pg18.integration.test.js` yangi migration bilan kengaytirildi, ammo **NOT RUN**; real PostgreSQL migration/trigger semantikasi va parallel testlar alohida ruxsatni kutadi.
- API integration testni qayta bajarish uchun `USTARA_TEST_OWNER_DATABASE_URL` va `USTARA_TEST_APP_DATABASE_URL` kerak. Bu suite migration SQL ishlatadi; alohida ruxsatsiz ishga tushirilmaydi.

## 3. Xatolar va ochiq masalalar

- Hozirgi tarixda yakuniy holati FAIL bo‘lgan unit suite yo‘q: auth policy, registration va frontend registration suite’laridagi dastlabki test-fixture xatolari tuzatilib, qayta bajarilganda PASS bo‘lgan. Dastlabki FAIL yozuvlari tarix uchun saqlandi.
- Tarixiy qayd: avval booking exclusion constraint, DB rollback va parallel natijalar tasdiqlanmagan edi. 2026-11-16 dagi foydalanuvchi taqdim etgan yakuniy PostgreSQL rerunida 21/21 scenario PASS, jumladan exclusion va parallel booking tekshiruvlari; yuqoridagi oldingi FAIL/SKIP yozuvlari o‘chirilmagan.
- `node --test` orqali ayrim alohida fayllar ishga tushirilganda wrapper `0` ta ichki testni ko‘rsatgan. Shu holatlarda haqiqiy test natijasi bevosita `node test/<fayl>.test.js` chiqishidan qayd etildi.
- Tarixiy qayd: `local-booking.integration.test.js` setup’ida `log_parameter_max_length=0` superuser/`SET` huquqini talab qilib connection startup’ni yiqitgan; sozlama keyin olib tashlangan. Bu tarixiy muammo foydalanuvchi bergan 2026-11-16 yakuniy 21/21 PASS natijasidan oldingi holat.
- Tarixiy qayd: booking integration setup’ida `public.users` baseline o‘qishida `42501 — permission denied for table users` bo‘lgan. O‘sha paytda `USTARA_TEST_DATABASE_URL` yo‘qligi sabab katalog privilege auditi bajarilmagan. Foydalanuvchi keyingi UPDATE privilege o‘zgarishlari faqat `ustara_test_db`da bajarilganini va yakuniy rerun 21/21 PASS bo‘lganini bildirdi.
- Tarixiy qayd: 2026-11-16 dagi avvalgi booking POST `500` va privilege yetishmasligi shu bosqichdagi muammolar edi. Foydalanuvchi ma’lumotiga ko‘ra, keyin faqat `ustara_test_db` ichida `users.created_at` va `barber_telegram_links.linked_at` ustunlariga UPDATE huquqi qo‘shilgan; yakuniy integration rerun 21/21 PASS bo‘lgan.
- Tarixiy qayd: oldingi exclusion testining sanitizatsiyalangan hisobotida SQLSTATE va katalog flag’lari saqlanmagan. Foydalanuvchi ma’lumotiga ko‘ra, `20261115_slots_02_booking_no_overlap.sql` keyinchalik faqat `ustara_test_db`da muvaffaqiyatli bajarilgan; constraint valid, GiST index valid/ready/live va yakuniy 21 scenario PASS bo‘lgan.
- Ushbu reyestrni yangilashda `.env` o‘qilmadi va hech qanday database’ga ulanilmadi.

## 4. 2026-11-16 — btree_gist bootstrap guard

| Test / tekshirilgan funksionallik | Sana | Natija | Testlar soni | Muhit / database | Turi | Izoh |
|---|---|---:|---:|---|---|---|
| `node backend/test/bootstrap-plan.unit.test.js` — bootstrap guard va verify uchun extension membership, public/custom schema istisnosi, relation/function inventory hamda prerequisite xabarlari | 2026-11-16 | PASS | 13: 13 PASS, 0 FAIL, 0 SKIP | Offline/static; PostgreSQL va DB ulanmagan | Unit/source-contract test | SQL matni katalog membership va policy shartlari bo‘yicha tekshirildi. Bu PostgreSQL catalog/runtime tekshiruvi emas. |

Ushbu o‘zgarishlar uchun PostgreSQL runtime/bootstrap testlari bajarilmadi; hech qanday SQL ishga tushirilmadi va database’ga ulanilmadi.

## 5. 2026-11-16 — Account Integrity migration rerun validation

| Test / tekshirilgan funksionallik | Sana | Natija | Testlar soni | Muhit / database | Turi | Izoh |
|---|---|---:|---:|---|---|---|
| `node backend/test/account-profile-integrity-migration.unit.test.js` — marker bor rerun branchdagi UNIQUE/index, composite FK, trigger/function/security, CHECK expression va fail-closed source contract tekshiruvlari | 2026-11-16 | PASS | 6: 6 PASS, 0 FAIL, 0 SKIP | Offline/static; PostgreSQL va DB ulanishi yo‘q | Unit/source-contract test | Dastlab marker joylashuvi sabab bitta test assertion `IF v_applied THEN`ni noto‘g‘ri bo‘limdan qidirib FAIL bo‘ldi; assertion to‘liq migration boshidan tekshiradigan qilib tuzatildi. Keyingi bevosita ishga tushirish 6/6 PASS. Bu SQL runtime/catalog semantikasi tasdig‘i emas. |
| `git diff --check` va migration/test untracked fayllari uchun `git diff --no-index --check` | 2026-11-16 | PASS | Test emas | DB ulanishi yo‘q | Whitespace/static tekshiruv | Tracked diff va ushbu o‘zgarishning untracked fayllarida whitespace muammosi topilmadi. |

Bu o‘zgarish uchun PostgreSQL runtime migration va integration testlari **NOT RUN**; hech qanday SQL bajarilmadi va database’ga ulanilmadi.

## 7. 2026-11-16 — PostgreSQL integration test import va schema guardlari

| Test / tekshiruv | Sana | Natija | Testlar soni | Muhit / database | Turi | Izoh |
|---|---|---:|---:|---|---|---|
| `node backend/test/testDatabaseTarget.unit.test.js` — birinchi urinish | 2026-11-16 | FAIL | 4: 3 PASS, 1 FAIL | Offline mock; PostgreSQL ulanmagan | Unit test | Ownership helper yaratilgan schema OID'ini qaytargan, test esa `undefined` kutgan; faqat assertion kutilmasi tuzatildi. |
| `node backend/test/testDatabaseTarget.unit.test.js` — assertion tuzatilgandan keyin | 2026-11-16 | PASS | 4: 4 PASS, 0 FAIL, 0 SKIP | Offline mock; PostgreSQL ulanmagan | Unit test | Ruxsat etilgan session user, database/current user, superuser, schema ownership/OID va post-create schema/search_path tekshiruvlari sinovdan o‘tdi. |
| `node backend/test/integrationImportSafety.unit.test.js` | 2026-11-16 | PASS | 2: 2 PASS, 0 FAIL, 0 SKIP | Offline/static; PostgreSQL ulanmagan | Source-contract unit test | API/account suite’ларда URL/opt-in va schema guard bajarilishidan oldin DB/controller/service import qilinmasligi tekshirildi. |
| `node backend/test/databasePoolConfig.unit.test.js` | 2026-11-16 | PASS | 7: 7 PASS, 0 FAIL, 0 SKIP | Offline; PostgreSQL ulanmagan | Unit test | Mavjud test URL, production override, host va search_path siyosati qayta tekshirildi. |
| `node backend/test/account-profile-integrity-migration.unit.test.js` | 2026-11-16 | PASS | 6: 6 PASS, 0 FAIL, 0 SKIP | Offline/static; PostgreSQL ulanmagan | Unit/source-contract test | Mavjud rerun validation source testlari qayta o‘tdi; bu migration runtime tasdig‘i emas. |
| O‘zgartirilgan 7 JavaScript fayl uchun `node --check` | 2026-11-16 | PASS | 7 fayl | Statik; DB ishlatilmadi | Syntax tekshiruvi | Uch integration suite, ikki helper va ikki yangi offline unit test tekshirildi. |
| `git diff --check` va yangi fayllar uchun alohida whitespace tekshiruvi | 2026-11-16 | PASS | Test emas | Statik; DB ishlatilmadi | Whitespace tekshiruvi | Tracked/untracked o‘zgarishlarda trailing whitespace yoki patch format muammosi topilmadi. |
| API, Account Integrity va Admin Account Deletion PostgreSQL integration suite’lari | 2026-11-16 | NOT RUN | 3 suite | PostgreSQL ishlatilmadi | Integration | Bu ish doirasida DB ulanishi, SQL va migration taqiqlangan; runtime role/schema/catalog xatti-harakati tasdiqlanmadi. |

Ushbu tekshiruvlarda hech qanday PostgreSQL ulanishi ochilmadi, SQL yoki migration bajarilmadi.
Account Integrity va Admin Account Deletion suite’larini keyin ishga tushirish uchun `NODE_ENV=test`, mavjud explicit opt-in, valid local `USTARA_TEST_DATABASE_URL` va operator aniq belgilagan `USTARA_ACCOUNT_INTEGRITY_TEST_USERS` allowlist’i kerak. Ushbu allowlist API suite’dagi `ustara_test_owner`/`ustara_test_app` role’larini qabul qilmaydi; ulanishda role superuser emasligi runtime’da tekshiriladi.

## 8. 2026-11-16 — Account Integrity migration rerun integration testi

| Test / tekshiruv | Sana | Natija | Testlar soni | Muhit / database | Turi | Izoh |
|---|---|---:|---:|---|---|---|
| `node backend/test/integrationImportSafety.unit.test.js` — yangi migration rerun suite guard’i qo‘shilishidan oldingi urinish | 2026-11-16 | FAIL | 3: 2 PASS, 1 FAIL | Offline/static; PostgreSQL ulanmagan | Source-contract unit test | Assertion `openScenario()` ichida kechiktirilgan `require()`ni top-level import deb xato tasnifladi; tekshiruv faqat module header/import vaqtini qamraydigan qilib tuzatildi. |
| `node backend/test/integrationImportSafety.unit.test.js` — assertion tuzatilgandan keyin | 2026-11-16 | PASS | 3: 3 PASS, 0 FAIL, 0 SKIP | Offline/static; PostgreSQL ulanmagan | Source-contract unit test | Yangi suite ikkala explicit opt-in va URL validation’dan keyin harness’ni yuklashi tekshirildi. |
| `node backend/test/account-profile-integrity-migration.unit.test.js` | 2026-11-16 | PASS | 6: 6 PASS, 0 FAIL, 0 SKIP | Offline/static; PostgreSQL ulanmagan | Migration source-contract unit test | Migration rerun catalog validation болон marker-present fail-closed source checks. SQL ажиллуулаагүй. |
| Yangi integration suite va import-safety unit test uchun `node --check` | 2026-11-16 | PASS | 2 fayl | Statik; DB ishlatilmadi | Syntax tekshiruvi | Yangi integration test va yangilangan offline unit test sintaksisi tekshirildi. |
| `git diff --check` va yangi/untracked o‘zgarishlar uchun whitespace tekshiruvi | 2026-11-16 | PASS | Test emas | Statik; DB ishlatilmadi | Whitespace tekshiruvi | Tracked diff hamda yangi test fayllari tekshirildi. |
| `account-profile-integrity-rerun.integration.test.js` — 7 PostgreSQL ssenariysi | 2026-11-16 | NOT RUN | 7 ssenariy | PostgreSQL ishlatilmadi | Integration | Har bir ssenariy alohida harness schema yaratadigan kodоор бэлтгэсэн; хэрэглэгчийн зааврын дагуу suite ажиллуулаагүй. |

Rerun integration suite normal first-run/rerun, parent UNIQUE, FK mapping, FK ON DELETE, deferred trigger, trigger function body ва CHECK өөрчлөлтийн тохиолдлуудыг хамарна. Энэ бүртгэл код бичигдсэнийг илэрхийлнэ; PostgreSQL catalog болон migration runtime behavior баталгаажаагүй.

## 6. 2026-11-16 — Account Integrity va account deletion yakuniy ko‘rik

| Test / tekshiruv | Sana | Natija | Soni | Muhit | Izoh |
|---|---|---:|---:|---|---|
| `node backend/test/servicesBody.unit.test.js` | 2026-11-16 | PASS | 16/16 | Offline query double | `addService`, `refreshServiceData`, `deleteService` lock ketma-ketligi, transaction va rollback xatti-harakati tekshirildi. |
| `node backend/test/bookings.unit.test.js` — yangi customer row lock assertion’dan oldingi urinishlar | 2026-11-16 | FAIL | 3 urinish; har birida 10 PASS, 8 FAIL | Offline mock | Booking mock yangi `customers` identity lock query’siga javob bermagani uchun 404 qaytardi. Mock account identity bilan moslashtirildi. |
| `node backend/test/bookings.unit.test.js` — mock tuzatilib, profile/account lock ketma-ketligi aniqlashtirilgandan keyin | 2026-11-16 | PASS | 18/18 | Offline, transaction mock | Customer profile → account row → barber advisory → barber row → service row tartibi tekshirildi. Oxirgi 18/18 natija shu kodni qamrab oladi. Bu PostgreSQL deadlock/concurrency isboti emas. |
| `node backend/test/telegram.unit.test.js` | 2026-11-16 | PASS | 9/9 | Offline transaction mock | Telegram owner/consume oqimlariga barber advisory lock qo‘shilishi bilan bog‘liq tekshiruv; haqiqiy PostgreSQL lock sinovi emas. |
| `node backend/test/registration.unit.test.js` — profile mock засахаас өмнөх оролдлогууд | 2026-11-16 | FAIL | 2 urinish; har birida 20 PASS, 1 FAIL | Offline router/query mock | Customer DB injection signature болон barber profile query mock бодит controller query-тэй зөрсөн. Test fixture’уудыг зассан. |
| `node backend/test/registration.unit.test.js` — mock’ууд засагдсаны дараа | 2026-11-16 | PASS | 21/21 | Offline/in-memory va router mock | OTP, login/JWT, role болон profile update regression шалгалтууд. |
| Тухайн өөрчлөлттэй 10 JavaScript файлд `node --check` | 2026-11-16 | PASS | 10 файл | Статик; DB ашиглаагүй | Controller, offline болон integration test файлуудын syntax шалгалт. |
| `git diff --check`; Git nazoratidagi bo‘lmagan 11 o‘zgargan fayl uchun `git diff --no-index --check /dev/null <file>` | 2026-11-16 | PASS | Test emas | Whitespace/static | Hech bir tekshiruvda whitespace muammosi chiqmadi. `--no-index` fayllar farqli bo‘lgani uchun 1 qaytardi, diagnostic chiqishi bo‘sh edi. |
| `api.integration.test.js`, `account-profile-integrity.integration.test.js`, `admin-account-deletion.integration.test.js` болон шинээр нэмсэн deletion concurrency хувилбарууд | 2026-11-16 | NOT RUN | 3 PostgreSQL suite | PostgreSQL холболтгүй | Хатуу аюулгүй байдлын шаардлагаар DB suite ажиллуулаагүй; concurrency, cascade, deferred trigger, role immutability болон deletion rollback runtime баталгаажаагүй. |

Энэ үе шатанд PostgreSQL-д холбогдоогүй, SQL эсвэл migration ажиллуулаагүй. Эхний offline test FAIL-үүдийн үр дүнг нуухгүйгээр дээр тэмдэглэж, fixture/mock шалтгааныг зассаны дараах PASS-уудыг тусад нь бүртгэв.

## 9. 2026-11-16 — Account Integrity PostgreSQL integration preflight

| Suite | Natija | Test/scenario bajarildi | Davomiylik | Database/schema | Cleanup | Izoh |
|---|---|---:|---:|---|---|---|
| `account-profile-integrity.integration.test.js` | NOT RUN | 0 | 0 s; suite boshlanmadi | PostgreSQL ulanilmadi; vaqtinchalik schema yaratilmagan | N/A; harness cleanup boshlanmadi | `USTARA_TEST_DATABASE_URL`, `USTARA_ACCOUNT_INTEGRITY_TEST_USERS`, `USTARA_ACCOUNT_INTEGRITY_TESTS` va `NODE_ENV` joriy jarayonda belgilanmagan. URL yo‘qligi sabab database target hamda credential tekshirilmadi. |
| `admin-account-deletion.integration.test.js` | NOT RUN | 0 | 0 s; suite boshlanmadi | PostgreSQL ulanilmadi; vaqtinchalik schema yaratilmagan | N/A; harness cleanup boshlanmadi | Xuddi shu yetishmayotgan konfiguratsiya sabab ishga tushirilmadi. |
| `account-profile-integrity-rerun.integration.test.js` | NOT RUN | 0 | 0 s; suite boshlanmadi | PostgreSQL ulanilmadi; vaqtinchalik schema yaratilmagan | N/A; harness cleanup boshlanmadi | Yuqoridagilardan tashqari `USTARA_ACCOUNT_INTEGRITY_RERUN_TESTS` ham belgilanmagan; ishga tushirilmadi. |

Preflight faqat joriy jarayon environment sozlamalarining mavjudligini va target URL validatsiyasini tekshirdi; maxfiy qiymatlar chiqarilmadi. Database ulanishi, SQL, migration yoki test bajarilmadi. Avvalgi offline test natijalari o‘zgartirilmadi.

## 10. 2026-11-17 — Barber profil migrationi uchun test database preflight

| Tekshiruv | Natija | Database | Izoh |
|---|---|---|---|
| `20261117_barber_profile.sql` SQL amallarini ko‘rib chiqish | PASS; faqat statik ko‘rik | Ulanish bo‘lmadi | Migration `ustara_schema_migrations` va `barbers` jadvallarini talab qiladi. Mavjud ma’lumotlarni o‘zgartirmaydi yoki o‘chirmaydi; yettita nullable ustun, ikkita CHECK qo‘shadi va versiya belgisini kiritadi. Jadvallarni qulflaydi. |
| Oldingi migrationga bog‘liqlik | PASS; fayl/kod bo‘yicha | Ulanish bo‘lmadi | Migration `20261116_account_profile_deletion_integrity` belgisini talab qiladi. Test database migration tarixi ulanmasdan tekshirilmadi; shu sabab 20261117 bajarilmadi. |
| `ustara_test_db` target va migration tarixini tekshirish | NOT RUN | Faqat mo‘ljallangan target: `ustara_test_db` | Joriy jarayonda `USTARA_TEST_DATABASE_URL` va test pool sozlamalari mavjud emas edi. Ro‘yxatdagi PostgreSQL 18 va 16 klasterlari ham to‘xtatilgan edi. Database’ga ulanmadim; `current_database()`, `current_user` va `current_schema()` o‘qilmadi. |
| `20261117_barber_profile.sql` migrationini qo‘llash | NOT RUN; qo‘llanmadi | Database ishlatilmadi | 20261116 belgisi va joriy database identity xavfsiz tekshirilmagani uchun migration biror database’da bajarilmadi. Boshqa migration yoki SQL bajarilmadi. |
| Barber profil PostgreSQL integratsion sinovlari | NOT RUN | PostgreSQL ishlatilmadi | O‘z profilini olish/yangilash, begona barber va customer rad etilishi, koordinata/tajriba validatsiyasi, ixtiyoriy qiymatlarni NULL saqlash va public response maxfiyligi runtime’da tekshirilmadi. |

Migration qayta bajarilishidagi katalog tekshiruvlari, ustun turlari va NULL holati, migration tarixidagi marker, hamda mavjud qatorlar saqlangani PostgreSQL’da tasdiqlanmagan. Keyingi urinishdan oldin `ustara_test_db` ishlaydigan lokal PostgreSQL orqali mavjud bo‘lishi va 20261116 migration belgisi borligi faqat o‘qish tekshiruvi bilan tasdiqlanishi kerak. Bu bosqichda `.env` va `backend/db.js` ochilmadi yoki o‘zgartirilmadi.

## 11. 2026-11-17 — Account/profile integrity migration va PostgreSQL tekshiruvlari

| Amal yoki test | Natija | Database / muhit | Haqiqiy natija |
|---|---|---|---|
| `20261116_account_profile_deletion_integrity.sql` statik ko‘rigi va prerequisite tahlili | PASS | DB ulanmasdan | 11 ta oldingi migration markeriga bog‘liqligi tekshirildi. Migration account/profile mosligini tekshiradi, `users(id, role)` kalitini, role/name CHECK’larini, composite cascade FK’larini, role immutable trigger’ini, profile lock va kechiktirilgan invariant trigger’larini/function’larini yaratadi; OTP katalog izohini joriy sxema snapshot’i bilan yangilaydi. |
| Migrationdan oldingi target va schema/data preflight | PASS | Faqat `ustara_test_db`; `current_user=nurbek`, `current_schema=public` | Database nomi `ustara_test_db` bo‘ldi. 11 prerequisite markerning barchasi bor, 20261116 marker yo‘q edi. Kerakli jadvallar/ustunlar, mavjud unique indexlar, tasdiqlangan eski `user_id` FK’lari, specialty CHECK va OTP arxiv metadata tekshirildi. Profilga oid jadvallarda 0 qator bor; nom, owner, role yoki specialty ziddiyati yo‘q edi. |
| `20261116_account_profile_deletion_integrity.sql` birinchi qo‘llash | PASS | Faqat `ustara_test_db` | `psql -f` `BEGIN`, `DO`, `COMMIT` bilan muvaffaqiyatli tugadi. Boshqa migration, `schema.sql` yoki `bootstrap.sql` bajarilmadi. |
| Read-only migrationdan keyingi tekshiruv | PASS | Faqat `ustara_test_db` | Migration belgisi 1 ta. `users_id_role_key`, profile role/name CHECK’lari, 2 ta composite `ON DELETE CASCADE` FK, 6 ta trigger, 4 ta `SECURITY DEFINER` PL/pgSQL function mavjud; trigger’lar yoqilgan, kechiktirilgan trigger’lar `INITIALLY DEFERRED`. `users/customers/barbers` qatorlari 0/0/0 bo‘lib qoldi. |
| Shu migration fayli bilan marker-mavjud idempotency rerun | PASS | Faqat `ustara_test_db` | Ikkinchi `psql -f` `BEGIN`, `DO`, `COMMIT` bilan muvaffaqiyatli tugadi; marker-mavjud katalog tekshiruvi xatosiz yakunlandi. Persistent marker va qator soni o‘zgarmadi. |
| `account-profile-integrity.integration.test.js` | NOT RUN | PostgreSQL test API ssenariylari | Kerakli opt-in va session-user allowlist yo‘q; joriy `nurbek` session superuser bo‘lib, test helper superuser ulanishini rad etadi. Bundan tashqari harness migration zanjiridagi 20261117 ni ham vaqtinchalik sxemada bajaradi; joriy vazifada u taqiqlangan. |
| `admin-account-deletion.integration.test.js` | NOT RUN | PostgreSQL test API ssenariylari | Xuddi shu test harness, opt-in/allowlist yo‘qligi va 20261117 ni bajarish xavfi sabab ishga tushirilmadi. |
| `account-profile-integrity-rerun.integration.test.js` | NOT RUN | PostgreSQL test API ssenariylari | Xuddi shu harness 20261117 migrationini ham vaqtinchalik sxemada bajaradi; taqiqni chetlab o‘tish uchun ishga tushirilmadi. |

Uch dastlabki katalog audit so‘rovidan ikkitasi noto‘g‘ri katalog ustun nomlari, bittasi SQL yozilish xatosi sabab bajarilmadi. Ular `READ ONLY` tranzaksiyada bajarildi va `ON_ERROR_STOP` sabab tranzaksiya rollback bo‘ldi; hech qanday ma’lumot yoki sxema o‘zgarmadi. Tuzatilgan auditlar yuqoridagi natijalarni berdi. Idempotency rerun’dan keyingi yakuniy tekshiruv ham marker soni 1 va qator sonlari 0/0/0 ekanini tasdiqladi. `ustara_db` ga ulanilmadi. `.env` va `backend/db.js` ochilmadi yoki o‘zgartirilmadi. `20261117_barber_profile.sql` bajarilmadi.

## 12. 2026-11-17 — Barber profil migrationi: test database urinish

| Amal yoki test | Natija | Database / muhit | Haqiqiy natija |
|---|---|---|---|
| 20261116 prerequisite va 20261117 marker preflight | PASS | Faqat `ustara_test_db`; `current_user=nurbek`, `current_schema=public` | 20261116 belgisi 1 ta, 20261117 belgisi 0 ta. `barbers` jadvali va tayanch ustunlari bor; yettita yangi ustun va ikkita CHECK nomi hali mavjud emas. `users/customers/barbers` qatorlari 0/0/0 edi. |
| `20261117_barber_profile.sql` qo‘llash | FAIL | Faqat `ustara_test_db` | `psql -f` `BEGIN`, `SET`, `SET` dan keyin `DO` blokida SQL sintaksis xatosi bilan to‘xtadi: `syntax error at end of input`, `IS DISTINCT FROM CASE WHEN ...` shartida. `COMMIT` ga yetmadi. Migration muvaffaqiyatli qo‘llanmadi. Boshqa migration bajarilmadi va fayl tuzatilmagan. |
| Migrationdan keyingi marker, ustun, constraint va qator tekshiruvi | NOT RUN | PostgreSQL ishlatilmadi | Xatodan keyin boshqa SQL bajarilmadi; markerning yakuniy holati, ustunlar va qator soni qayta so‘ralmadi. Skript tranzaksiya ichida `COMMIT` ga yetmagan. |
| Barber profil PostgreSQL integratsion testlari | NOT RUN | PostgreSQL ishlatilmadi | Migration xatosidan keyin to‘xtash talabi bo‘yicha testlar ishga tushirilmadi. |

Migrationning natijasi xato sababli `COMMIT` qilinmadi; PostgreSQL tranzaksiyani ulanish yopilganda bekor qiladi. Bu urinishdan keyin marker yoki sxema holatini qo‘shimcha SQL bilan tekshirmadim va migrationni qayta bajarmadim. `ustara_db` ga ulanilmadi. `.env`, `backend/db.js`, `schema.sql`, `bootstrap.sql` va migration fayllari o‘zgartirilmadi.

## 13. 2026-11-17 — Barber profil migration CASE sintaksisi tuzatildi

| Amal yoki test | Natija | Muhit | Haqiqiy natija |
|---|---|---|---|
| `20261117_barber_profile.sql` dagi `IS DISTINCT FROM CASE` tuzatishi | PASS | Faqat fayl tahriri | CASE ifodasi qavs ichiga olindi: `column_type IS DISTINCT FROM (CASE ... END)`. Faqat PostgreSQL ifoda guruhlanishi o‘zgardi; ustunlar, NULL qoidalari, ikkala CHECK va rerun tekshiruvlari o‘zgarishsiz qoldi. |
| `node backend/test/barber-profile.unit.test.js` | PASS | Offline; database ishlatilmadi | 7/7 test, shu jumladan migrationdagi CASE qavslarini tekshiruvchi statik assertion. |
| `node --check backend/test/barber-profile.unit.test.js` | PASS | Statik; database ishlatilmadi | Test fayli sintaksisi to‘g‘ri. |
| Migrationni qayta bajarish yoki PostgreSQL integratsion sinovi | NOT RUN | Database ishlatilmadi | Foydalanuvchi migrationni ishga tushirmaslikni buyurdi. Oldingi bajarish `COMMIT` ga yetmagan; migration muvaffaqiyatli qo‘llangani tasdiqlanmagan. |

Ushbu tuzatishdan keyin `.env`, `backend/db.js` yoki boshqa migration fayliga tegilmadi; database ulanishi va SQL bajarilishi bo‘lmadi.

## 14. 2026-11-17 — Tuzatilgan barber profil migrationi test bazasiga qo‘llandi

| Amal yoki test | Natija | Database / muhit | Haqiqiy natija |
|---|---|---|---|
| Preflight: database identity va migration markerlari | PASS | Faqat `ustara_test_db`; `current_user=nurbek`, `current_schema=public` | 20261116 marker 1 ta, 20261117 marker 0 ta edi. `barbers` jadvali va tayanch ustunlari bor edi; migration ustunlari va CHECK nomlari hali yo‘q edi. |
| Preflight: ma’lumotlar soni | PASS | Faqat `ustara_test_db` | `barbers` jadvali migrationdan oldin 0 qator edi. |
| `20261117_barber_profile.sql` qo‘llash | PASS | Faqat `ustara_test_db` | Tuzatilgan fayl `psql -f` bilan bir marta bajarildi; `BEGIN`, `SET`, `SET`, `DO`, `COMMIT` muvaffaqiyatli yakunlandi. Boshqa migration yoki schema/bootstrap fayli bajarilmadi. |
| Post-check: migration markeri va ustunlar | PASS | Faqat `ustara_test_db` | Marker 1 ta. Yetti ustun mavjud va nullable, default qiymatsiz: `salon_name TEXT`, `address TEXT`, `latitude DOUBLE PRECISION`, `longitude DOUBLE PRECISION`, `experience_years INTEGER`, `bio VARCHAR(200)`, `avatar_url TEXT`. |
| Post-check: CHECK constraintlar | PASS | Faqat `ustara_test_db` | `barbers_location_check` koordinatalarni juft NULL yoki ikkalasini ham geografik oraliqda talab qiladi; `barbers_experience_years_check` NULL yoki 0–99 oralig‘ini talab qiladi. Ikkalasi ham validatsiyadan o‘tgan. |
| Post-check: mavjud qatorlar | PASS | Faqat `ustara_test_db` | `barbers` jadvali 0 qator bo‘lib qoldi. |
| Barber profil PostgreSQL integratsion testlari | NOT RUN | PostgreSQL sinovlari | Mavjud `local-barber.integration.test.js` barber profil bilan birga service, schedule va Telegram ssenariylarini ham bajaradi. Kerakli `USTARA_TEST_DATABASE_URL` va explicit `USTARA_LOCAL_BARBER_WRITE_TESTS` sozlamalari joriy jarayonda yo‘q edi; keng qamrovli suite ishga tushirilmadi. Migration marker mavjud bo‘lgani uchun migration qayta bajarilmadi. |

Migration fayli ushbu qo‘llash bosqichida o‘zgartirilmadi; avvalgi tuzatishdagi CASE qavsli shakli ishlatildi. `ustara_db` ga ulanilmadi. `.env` va `backend/db.js` ochilmadi yoki o‘zgartirilmadi.

## 15. 2026-11-17 — Barber profil API alohida PostgreSQL integratsion sinovi

| Sinov / tekshiruv | Natija | Soni | Database / muhit | Izoh |
|---|---|---:|---|---|
| `backend/test/barber-profile.postgres.integration.test.js` sintaksisi (`node --check`) | PASS | 1 fayl | Statik; DB ulanilmadi | Test fayli sintaksis tekshiruvidan o‘tdi. |
| `node --test test/barber-profile.postgres.integration.test.js` | NOT RUN | 0 PostgreSQL ssenariysi | DB target tekshirilmadi | `USTARA_TEST_DATABASE_URL` mavjud emasligi sabab test DB ulanishidan oldin o‘tkazib yuborildi. Test runner buyruqni xatosiz yakunladi; bu PostgreSQL sinovlari bajarilganini anglatmaydi. |
| DB identity va test yozuvlari | NOT RUN / N/A | 0 | PostgreSQL ulanilmadi | `current_database()` so‘rovi yuborilmadi; yozuv yaratilmagan va cleanup talab qilinmagan. `ustara_test_db` targeti ushbu urinishda tasdiqlanmadi. |

Yangi alohida sinov tasdiqlangan public profil, pending barber, `/me`, profil maydonlarini yozib qayta o‘qish, egalik va rol ruxsatlari, admin, noto‘g‘ri qiymatlar, ixtiyoriy maydonlarni `NULL` saqlash hamda public javobdagi maxfiy maydonlarni tekshirish ssenariylarini o‘z ichiga oladi. PostgreSQL ulanishi va test yozuvlari bo‘lmagani uchun ushbu ssenariylarning barchasi NOT RUN. Sinov kodi `ustara_test_db` targetini tekshiradi, migration markerlari va ustunlarni faqat o‘qiydi, faqat o‘zi yaratgan account ID’larini tozalashga mo‘ljallangan; harness tomonidan migration yoki DDL bajarilmaydi. `backend/test/local-barber.integration.test.js` boshqa xizmat, jadval va Telegram ssenariylarini ham qamragani uchun ishga tushirilmadi. Ushbu bosqichda `.env`, `backend/db.js` yoki ma’lumotlar bazasiga tegilmadi.

### Keyingi bajarish — yakuniy natija

| Test fayli | Natija | Testlar | Chiqish kodi | Muhit |
|---|---|---:|---:|---|
| `backend/test/barber-profile.postgres.integration.test.js` | PASS | 11 PASS, 0 FAIL, 0 SKIP | 0 | Haqiqiy PostgreSQL integratsion testi; natija foydalanuvchi tomonidan taqdim etildi. |

Tekshirilgan holatlar: tasdiqlangan barberning ommaviy profili; tasdiqlanmagan barber ko‘rinmasligi; barberning o‘z profilini olishi; profil yangilanishi va bazada saqlanishi; egalik va rol vakolatlari; validatsiya; ixtiyoriy maydonlarning `NULL` holati; ommaviy javob maxfiyligi.

## 16. 2026-11-17 — Explore barber katalog API

| Tekshiruv | Natija | Soni | Muhit | Izoh |
|---|---|---:|---|---|
| `node --check backend/controllers/barbersController.js` | PASS | 1 fayl | Statik | Katalog controller sintaksisi to‘g‘ri. |
| `node --check backend/test/responseFields.unit.test.js` | PASS | 1 fayl | Statik | Yangilangan controller javob testi sintaksisi to‘g‘ri. |
| `node --check frontend/src/pages/user/explore/catalog.js` | PASS | 1 fayl | Statik | Frontend katalog moduli sintaksisi tekshirildi. |
| `node --check frontend/test/exploreCatalog.test.js` | PASS | 1 fayl | Statik | Explore API kontrakt testi sintaksisi tekshirildi. |
| `node test/responseFields.unit.test.js` — dastlabki urinish | FAIL | 11: 9 PASS, 2 FAIL | Offline mock; DB ulanilmadi | Detail va o‘z profil testlarida mock qatori nullable profil ustunlarini bermagani uchun kutuv va haqiqiy javob mos kelmadi. Mock qaytarishi tuzatildi. |
| `node test/responseFields.unit.test.js` — tuzatishdan keyin | PASS | 11: 11 PASS, 0 FAIL, 0 SKIP | Offline mock; DB ulanilmadi | Ommaviy ro‘yxat DTO’si, maxfiy ustunlarning chiqarilmasligi va bo‘sh massiv qaytishi ham tekshirildi. |
| `node test/exploreCatalog.test.js` | PASS | 7: 7 PASS, 0 FAIL, 0 SKIP | Frontend API mock; DB ulanilmadi | Mavjud `GET /api/barbers` kontrakti, xizmatlarni katalogga yig‘ish, qidiruv va mavjud bo‘lmagan qiymatlarni uydirmaslik tekshirildi. |
| PostgreSQL integratsion tekshiruvi | NOT RUN | 0 | DB ishlatilmadi | Vazifa cheklovi bo‘yicha ulanish va SQL bajarilmadi. |

Explore ro‘yxati endi faqat tasdiqlangan barberlarni parametrli so‘rov bilan oladi. Javobda telefon, account ID, yaratilgan vaqt yoki tasdiqlash holati yo‘q. Narx va xizmatlar mavjud `services` jadvalidan, manzil/koordinata/avatar/salon nomi barber profilidan olinadi. Viloyat va reyting/sharh uchun schema’da maydon yo‘q. Jadval hamda booking yozuvlaridan vaqtga bog‘liq bandlikni hisoblash qoidasi Explore kontraktida belgilanmagan; shu sabab bu qiymatlar taxmin qilinmadi. Explore ichida saralash boshqaruvi yo‘q, mavjud API tartibi yangidan eskiga saqlandi. Migration yoki schema o‘zgarishi talab qilinmadi.

## 17. 2026-11-17 — Explore katalog PostgreSQL integratsion sinovi tayyorlandi

| Tekshiruv | Natija | Soni | Muhit | Izoh |
|---|---|---:|---|---|
| `node --check backend/test/explore-catalog.postgres.integration.test.js` | PASS | 1 fayl | Statik | Yangi sinov fayli sintaksisi tekshirildi. |
| `env -u USTARA_TEST_DATABASE_URL -u USTARA_EXPLORE_CATALOG_TESTS NODE_ENV=test node test/explore-catalog.postgres.integration.test.js` | SKIP | 1 to‘plam, 0 PostgreSQL ssenariysi | DB ulanilmadi | Opt-in va ulanish URL’i yo‘qligida sinov kutilganidek o‘tkazib yuborildi. Chiqish kodi 0. |
| Haqiqiy PostgreSQL integratsion sinovi | NOT RUN | 11 rejalashtirilgan holat | PostgreSQL ishlatilmadi | Foydalanuvchi ko‘rsatmasiga binoan haqiqiy DB sinovi ishga tushirilmadi; migration, DDL yoki DML bajarilmadi. |

Yangi sinov tasdiqlangan/tasdiqlanmagan barber ko‘rinishi, ommaviy javob maxfiyligi, profil maydonlari, xizmat ID/nomlari va eng past narx, barber/salon/xizmat nomi bo‘yicha qidiruv, narx va masofa filtrlari hamda mos natija yo‘qligini qamraydi. Ulanish faqat local `ustara_test_db`, `ustara_account_test` session foydalanuvchisi va superuser bo‘lmagan sessiya uchun ruxsat etiladi. Sinovdagi yozuvlar faqat o‘zi yaratgan user ID va telefon orqali tozalanadi.

### Keyingi bajarish — haqiqiy PostgreSQL natijasi

| Test fayli | Natija | Testlar | Chiqish kodi | Muhit |
|---|---|---:|---:|---|
| `backend/test/explore-catalog.postgres.integration.test.js` | PASS | 12 PASS, 0 FAIL, 0 SKIP | 0 | Haqiqiy PostgreSQL, `ustara_test_db`; natija foydalanuvchi tomonidan taqdim etildi. |

Tekshirilgan holatlar: tasdiqlangan va tasdiqlanmagan barberlar; ommaviy javob maxfiyligi; profil maydonlari; xizmatlar va eng past narx; barber, salon va xizmat nomi bo‘yicha qidiruv; narx va masofa filtrlari; bo‘sh natija.

## 18. 2026-11-17 — Booking oqimi PostgreSQL integratsion sinovi tayyorlandi

| Tekshiruv | Natija | Soni | Muhit | Izoh |
|---|---|---:|---|---|
| `node --check test/booking-flow.postgres.integration.test.js` | PASS | 1 fayl | Statik; DB ulanilmadi | Yangi test fayli sintaksisi tekshirildi. |
| `env -u USTARA_TEST_DATABASE_URL -u USTARA_TEST_APP_DATABASE_URL -u USTARA_BOOKING_FLOW_TESTS NODE_ENV=test node test/booking-flow.postgres.integration.test.js` | SKIP | 1 to‘plam; 0 ichki ssenariy | DB ulanilmadi | Opt-in va test ulanish manzili berilmaganda test ulanishdan oldin o‘tkazib yuborildi; chiqish kodi 0. |
| Haqiqiy PostgreSQL booking oqimi | NOT RUN | 12 rejalashtirilgan ssenariy | PostgreSQL ishlatilmadi | Bu vazifada haqiqiy integratsion sinovni ishga tushirmaslik so‘ralgan. SQL, DDL, DML yoki migration bajarilmadi. |

Yangi test `testTarget` orqali faqat local `ustara_test_db`, `ustara_account_test` session foydalanuvchisi va superuser bo‘lmagan ulanishni talab qiladi. Haqiqiy ishga tushirish uchun `NODE_ENV=test`, `USTARA_TEST_DATABASE_URL` va `USTARA_BOOKING_FLOW_TESTS=I_AUTHORIZE_TEST_DATA` aniq berilishi kerak. Test serverdagi haqiqiy booking endpointlarini chaqiradi; test ma’lumotlari account, barber, mijoz, xizmat, ish vaqti va booking yozuvlaridan iborat. Cleanup faqat shu yugurishda yaratilgan account ID/telefonlari hamda ularga bog‘langan test bookinglari, xizmatlari va ish vaqtlari bo‘yicha bajariladi.

Kutiladigan eng kam ruxsatlar: `public` sxemasida `USAGE`; `users` jadvalida `SELECT`, `INSERT`, `DELETE`; `customers` va `barbers` jadvallarida `SELECT`, `INSERT`; `services` jadvalida `SELECT`, `INSERT`, `UPDATE`, `DELETE`; `barber_working_hours` jadvalida `SELECT`, `INSERT`, `DELETE`; `bookings` jadvalida `SELECT`, `INSERT`, `UPDATE`, `DELETE`; `account_session_versions` jadvalida `SELECT`; yangi yozuvlar uchun tegishli identity sequence’larda `USAGE`. Ruxsatlar o‘zgartirilmadi va GRANT bajarilmadi.

### Keyingi bajarish — booking oqimining haqiqiy PostgreSQL natijasi

| Test fayli | Natija | Testlar | Chiqish kodi | Muhit |
|---|---|---:|---:|---|
| `backend/test/booking-flow.postgres.integration.test.js` | PASS | 13 PASS, 0 FAIL, 0 SKIP | 0 | Haqiqiy PostgreSQL; natija foydalanuvchi tomonidan taqdim etildi. |

## 19. 2026-11-17 — Barber booking qabul qilish boshqaruvi

| Tekshiruv | Natija | Soni | Muhit | Izoh |
|---|---|---:|---|---|
| `node --test test/bookings.unit.test.js test/barber-profile.unit.test.js test/bootstrap-plan.unit.test.js` | PASS | 41 PASS, 0 FAIL, 0 SKIP | Offline unit va statik migration tekshiruvi | Dastlab mock lock tekshiruvi boshqa barber ID’sini qabul qilmay FAIL berdi; fixture tuzatilib buyruq qayta bajarildi. Yakuniy yugurishda booking pauzasi, bo‘sh vaqtlar, oldingi `pending`/`confirmed` holatlari, qayta yoqish, rol/egalik va lock tartibi tekshirildi. |
| `node --check` backend controller, service, route va test fayllari | PASS | 8 fayl; chiqish kodi 0 | Statik | Controller, service, route, unit-test, API va booking PostgreSQL integratsion test fayllari sintaksisi tekshirildi. |
| `./node_modules/.bin/vite build` | PASS | 182 modul | Frontend production build | Schedule JSX va store build jarayonida tekshirildi. |
| `booking-flow.postgres.integration.test.js` yangi ssenariylari | NOT RUN | 4 ssenariy tayyorlandi | PostgreSQL ulanilmadi | Default `TRUE`, ruxsat va boshqa barber holati, OFF paytida vaqtlar/yangi booking va eski holatlar, qayta yoqish hamda parallel so‘rovlar tekshiruvlari qo‘shildi. Vazifa shartiga ko‘ra haqiqiy PostgreSQL sinovi bajarilmadi. |
| `20261117_barber_profile_02_booking_acceptance.sql` migrationi | NOT APPLIED | 0 | Fayl tayyorlandi | Migration va bootstrap zanjiri yangilandi, ammo migration hech qaysi bazaga qo‘llanmadi. |

Migration `barbers.accepting_bookings BOOLEAN NOT NULL DEFAULT TRUE` ustunini qo‘shadi; oldingi `20261117_barber_profile` markerini talab qiladi va qayta ishga tushganda marker/ustun ta’rifini tekshiradi. `ustara_db` va `ustara_test_db` ishlatilmadi; SQL, DDL, DML va ruxsat o‘zgarishi bajarilmadi. Haqiqiy PostgreSQL sinovidan oldin migrationni alohida tasdiqlangan test bazasiga qo‘llash va shu xususiyat uchun testni aniq ruxsat bilan ishga tushirish kerak.

## 20. 2026-11-17 — Telegram OTP autentifikatsiyasini mustahkamlash

| Buyruq / tekshiruv | Natija | Haqiqiy testlar | Muhit / izoh |
|---|---|---:|---|
| `node --test test/registration.unit.test.js test/passwordReset.unit.test.js test/telegramRegistration.unit.test.js` — dastlabki regression | PASS | 37 | Offline mock; DB ulanilmadi. Keyin service va testlar o‘zgargani uchun quyidagi yakuniy regression bajarildi. |
| `node --test test/registration.unit.test.js test/passwordReset.unit.test.js test/telegramRegistration.unit.test.js test/bootstrap-plan.unit.test.js` | PASS | 52 PASS, 0 FAIL, 0 SKIP | Service mocklari, mavjud router regressiyasi va statik bootstrap tekshiruvi; 46 top-level va 6 ichki test. SQL bajarilmadi. |
| `node --test test/telegramOtp.unit.test.js test/telegram.unit.test.js` | PASS | 20 PASS, 0 FAIL, 0 SKIP | Adapter/bot/mock; doimiy reset bog‘lanishi, kontaktni almashtirishni rad etish, aniq BIGINT va eski bot funksiyalari. |
| `node --test test/telegramAuthHardening.unit.test.js` — dastlabki yangi testlar | PASS | 8 PASS | Webhook secret, replay, qayta urinish, challenge, mock parallel limit va transport timeout. Keyin controller vaqt himoyasi qo‘shildi. |
| `node --test test/telegramAuthHardening.unit.test.js test/passwordReset.unit.test.js` — controller o‘zgarishidan keyin | PASS | 21 PASS, 0 FAIL, 0 SKIP | 9 hardening va 12 password-reset unit testi. 9 soniyalik production kechikishi fake clock/sleep bilan tekshirildi; haqiqiy Telegram yoki DB yo‘q. Password-resetning 12 testi oldingi 52 ichida ham mavjud, umumiy songa takror qo‘shilmaydi. |
| Frontend: `node --test test/registration.test.js test/passwordReset.test.js` | PASS | 17 PASS, 0 FAIL, 0 SKIP | Mock fetch/storage; Telegram holati va countdown kontrakti hamda eski reset kontrakti. React/mobil browser sinovi emas. |
| O‘zgargan 5 frontend fayliga scoped ESLint | PASS | Chiqish kodi 0 | `TelegramOtpNotice.jsx`, `RegistrationForm.jsx`, `ForgotPassword.jsx`, `Otp.jsx`, `utils/registration.js`. |
| `./node_modules/.bin/vite build` | PASS | 183 modul, chiqish kodi 0 | Yakuniy OTP havolasini yangilash UI’si qo‘shilgach build qayta bajarildi. Buildda plugin vaqtiga oid axborot bor, build xatosi yo‘q. |
| `node --check` | PASS | 10 fayl | Yangi PostgreSQL testi, webhook, Telegram service’lar, limit service/middleware, identity, handler/worker va disposable OTP harness sintaksisi. SQL sintaksisining PostgreSQL orqali sinovi emas. |
| `test/telegram-auth.postgres.integration.test.js` | NOT RUN | 0 bajarilgan; 9 ichki ssenariy tayyorlangan | Haqiqiy PostgreSQL ulanishi, SQL va test DML uchun alohida ruxsat yo‘q. Faqat sintaksis tekshirildi. |
| `20261121_telegram_auth_hardening.sql` | NOT APPLIED | 0 | Yangi migration fayli va bootstrap zanjiri tayyorlandi. Jonli schema, constraint nomlari va FK/lock xatti-harakati tekshirilmadi. |
| Real Telegram / HTTPS webhook / mobil UI | NOT RUN | 0 | Botga API so‘rovi yuborilmadi, webhook sozlanmadi, browser/mobil qurilmada qo‘lda sinov bajarilmadi. |

Ba’zi sandbox test urinishlari `Failed to create stream fd: Operation not permitted` chiqarib, faqat fayl wrapperini PASS ko‘rsatdi. Ular haqiqiy ichki test natijasi sifatida hisobga olinmadi; tegishli buyruqlar sandbox tashqarisidagi ruxsat bilan qayta bajarilib yuqoridagi aniq TAP sonlari olindi.

Takrorlarni hisoblamaganda 81 backend unit/statik va 17 frontend mock testi tekshirildi. Bu 98 ta natija PostgreSQL integratsiyasi yoki mobil E2E isboti emas. Hech qaysi bazaga ulanilmadi; migration/SQL bajarilmadi. `.env` faqat foydalanuvchining aniq ruxsati doirasida o‘zgaruvchi nomi/qiymat mavjudligi uchun tekshirildi; qiymatlar chiqarilmadi va fayl o‘zgartirilmadi. Oldindan mavjud foydalanuvchi o‘zgarishlari saqlandi, git reset/checkout/stash/clean/revert/commit bajarilmadi.

Release cheklovlari va to‘liq fayllar ro‘yxati: `TELEGRAM_AUTH_HARDENING.md`. Alohida tasdiq talab etiladi: migration/app-role huquqlari, haqiqiy PostgreSQL sinovi, production webhook/trusted proxy va retention sozlamalari, Telegramga bog‘lanmagan eski account egaligini tekshirib tiklash siyosati. Mutlaq tarmoq/DB exactly-once kafolati yo‘q; production javoblari kamida 9 soniya kechiktiriladi, ammo bundan uzun DB/tarmoq nosozliklaridagi timing farqini to‘liq bartaraf etish uchun durable delivery queue kerak.

## 21. 2026-11-17 — Ikkinchi audit: sendMessage validatsiyasi va tranzaksion webhook

| Tekshiruv | Natija | Haqiqiy testlar | Muhit / chegara |
|---|---|---:|---|
| `node --test test/telegramDeliveryResponse.unit.test.js test/telegramWebhookTransaction.unit.test.js test/telegramAuthHardening.unit.test.js test/telegramOtp.unit.test.js test/telegram.unit.test.js test/telegramRegistration.unit.test.js test/passwordReset.unit.test.js` | PASS | 81 PASS, 0 FAIL, 0 SKIP | DB/Telegram tarmog‘i yo‘q. Yangi response/transaction testlari va mavjud auth/bot regressiyasi. |
| `node --test test/telegramDeliveryResponse.unit.test.js test/telegramWebhookTransaction.unit.test.js test/telegramAuthHardening.unit.test.js` — COMMIT natijasi tekshiruvi va qo‘shimcha HTTP testi kiritilgach | PASS | 46 PASS, 0 FAIL, 0 SKIP | 31 response, 6 webhook transaction va 9 avvalgi hardening testi. Oldingi yugurish bilan takrorlarni hisoblamaganda shu bosqichda 83 ta turli test o‘tdi: 37 yangi va 46 mavjud. |
| `node --check` — API, OTP adapteri, webhook, handler, transactionPool, PostgreSQL test va ikki yangi unit test | PASS | 8 fayl, chiqish kodi 0 | Faqat JavaScript sintaksisi. SQL yoki migration bajarilmadi. |
| `telegram-auth.postgres.integration.test.js` yangi webhook ssenariysi | NOT RUN | 0 bajarilgan; 1 yangi ko‘p bosqichli ssenariy tayyorlandi | Haqiqiy service SAVEPOINT, receipt oldida rollback, parallel request, controller qayta yaratish, OTP rollback va committed tarix/limit sonlari. Barcha DB amallari kelajakdagi alohida ruxsatga bog‘liq. |
| Haqiqiy process kill/restart va production webhook | NOT RUN | 0 | Mock controller qayta yaratilishi OS/process restart yoki haqiqiy PostgreSQL concurrency isboti emas. |

Response testlari `{"ok":true}` ichida result yo‘qligi, message_id yo‘qligi/string/0/manfiy/kasr/unsafe integer bo‘lishi, chat yo‘qligi yoki mos emasligi, noto‘g‘ri ok qiymati, HTTP xatosi va to‘g‘ri Message javobini qamraydi. Haqiqiy registration/reset service va adapterlar mavjud memory pool’lar bilan ishga tushirilib, rad etilgan javobda delivered yozilmasligi, registration tarixi va yuborish limiti rollback bo‘lishi tekshirildi. Maxfiy qiymatlar va OTP logga chiqmasligi ham tekshirildi.

Webhook testlari haqiqiy handler va yangi transaction adapterini memory transaction modeli bilan tekshiradi; biznes SQL’i simulyatsiya qilinadi. Parallel lock, handlerdan keyin receipt oldidagi injected uzilish, outer rollback, commit javobi yo‘qolishi, controller qayta yaratilishi, committed side-effect soni, reply xatosi, COMMIT o‘rnidagi ROLLBACK hamda savepoint/lease himoyasi tekshirildi. Mutlaq tashqi `exactly-once` da’vosi yo‘q. Oddiy javoblar commitdan keyin best-effort; crashda yo‘qolishi mumkin. OTP tarmoq yuborishi rollback qilinmaydi. Polling cursor processing o‘zgartirilmadi.

Dastlabki sandbox urinishida `Failed to create stream fd: Operation not permitted` chiqib, faqat 7 fayl wrapperi PASS ko‘rsatildi; bu ichki test natijasi sifatida hisoblanmadi. Testlar sandbox tashqarisidagi ruxsat bilan qayta bajarilib yuqoridagi aniq TAP sonlari olindi. Ikkala haqiqiy offline yugurishda FAIL bo‘lmadi.

`20261121` prefiksi mavjud `20261119/20261120`dan keyingi leksik version sifatida tanlangani `TELEGRAM_AUTH_HARDENING.md`da hujjatlashtirildi; bu kalendar yaratilish/ishga tushirish sanasi emas. Migration nomi, SQL matni, version, prerequisite va bootstrap o‘zgartirilmadi. Ushbu tuzatish uchun yangi schema zarur emas: mavjud receipt jadvali qayta ishlatildi. `.env` o‘qilmadi/o‘zgartirilmadi; `ustara_db` va `ustara_test_db`ga ulanilmadi; hech qanday SQL, migration yoki real Telegram API chaqiruvi bajarilmadi. Git reset/checkout/stash/clean/revert/commit bajarilmadi.

## 22. 2026-11-17 — Webhook lifecycle, deadline va booking texnik retry

| Haqiqatan bajarilgan tekshiruv | Natija | Soni | Muhit / izoh |
|---|---|---:|---|
| `node --test test/telegramWebhookLifecycle.unit.test.js test/telegramWebhookTransaction.unit.test.js test/telegramAuthHardening.unit.test.js test/bookings.unit.test.js` | PASS | 53 PASS, 0 FAIL, 0 SKIP | Offline; dastlabki 17 yangi lifecycle testi, mavjud 6 webhook transaction, 9 hardening va 21 booking testi. DB va Telegram mock. Ikki `injected storage failure` xabari mavjud booking testlarining kutilgan chiqishi. |
| `node --test test/telegramWebhookLifecycle.unit.test.js test/telegramWebhookTransaction.unit.test.js test/telegramAuthHardening.unit.test.js` — yakuniy helper/guard va qo‘shimcha ssenariylardan keyin | PASS | 37 PASS, 0 FAIL, 0 SKIP | 22 lifecycle, 6 webhook transaction va 9 hardening testi. Oldingi yugurish bilan takrorlarni hisoblamaganda ushbu bosqichda 58 ta turli test tekshirildi: 22 yangi va 36 mavjud. |
| `node --check` — `webhookLifecycle.js`, `webhook.js`, `transactionPool.js`, `bookingCallbacks.js`, yangi lifecycle testi, ikki webhook unit testi va PostgreSQL testi | PASS | 8 fayl, chiqish kodi 0 | Faqat JavaScript sintaksisi; PostgreSQL test fayli baholanmadi va bajarilmadi. |

Yangi lifecycle suite controller, transaction adapter, callback handler va booking service’ning haqiqiy kodini xotiradagi DB/session modeli bilan ishlatadi. Client `error/end`, takroriy hodisalar, connection-loss’dan keyingi OTP chaqirig‘ini bloklash, native timer talab qilinishi, checkout watchdog va kech client destroy, query/COMMIT/processing deadline, in-flight API abort, rollback timeout/xatosi, BEGIN/SAVEPOINT/RELEASE/ROLLBACK TO xatolari, bitta physical release/socket destroy, listener cleanup va idempotent dispose tekshirildi. Bookingning 4xx biznes rad javobi receipt+200, raw DB/typed 500 xatosi receiptsiz 503, keyingi retry hamda bir xil/yangi update ichidagi takroriy callback xavfsizligi tekshirildi. Post-commit connection-loss’dan keyingi ikkinchi xabar bloklanishi, HTTP abort va non-enumerable credential descriptorining yangi poolga xavfsiz ko‘chirilishi ham tekshirildi. Unit testlar kech continuation SQL/APIga qayta kira olmasligini tekshiradi; ular remote PostgreSQL query cancellation isboti emas.

Dastlabki sandbox urinishida `Failed to create stream fd: Operation not permitted` chiqdi va faqat 4 fayl wrapperi PASS ko‘rindi. Bu ichki test natijasi sifatida hisobga olinmadi. Yuqoridagi aniq TAP natijalari sandbox tashqarisidagi ruxsat bilan bajarilgan ikki yugurishdan olindi. Bajarilgan haqiqiy testlarda FAIL bo‘lmadi.

Ushbu bosqichda `.env` ochilmadi/o‘zgartirilmadi, real DB yoki Telegramga ulanish bo‘lmadi. SQL, migration yoki schema o‘zgarishi bajarilmadi; migration yaratilmadi. PostgreSQL integratsion testining fault-client wrapper’iga event/socket delegatsiyasi qo‘shildi, ammo uning faqat JavaScript sintaksisi tekshirildi. Haqiqiy PostgreSQL, tarmoq uzilishi va real Telegram retry sinovlari ushbu natijalarga kiritilmagan. Barcha mavjud foydalanuvchi o‘zgarishlari saqlandi; git commit/reset/stash/checkout/clean/revert bajarilmadi.

## 23. 2026-11-17 — OTP nosozligining read-only diagnostikasi va xavfsiz limiter loglari

| Bajarilgan tekshiruv | Natija | Soni / muhit | Aniq chegara |
|---|---|---|---|
| Sozlamalar readiness tekshiruvi | PASS | Faqat valid/invalid; qiymatlar chiqarilmadi | Telegram konfiguratsiyasi, HMAC va adapter readiness valid; Telegram adapteri tanlangan. Local rejim polling. Haqiqiy Telegram API avtorizatsiyasi tekshirilmagan. |
| Foydalanuvchi ruxsati bilan amaldagi mahalliy DB sxemasini `READ ONLY` audit qilish | PASS | `ustara_db.public`; katalog/marker/huquq o‘qish | `otp_request_limits`, `telegram_registration_requests`, `telegram_webhook_receipts` va yangi account/delivery ustunlari yo‘q; `20261120/20261121` qo‘llanmagan. `20261119` va uning prerequisite markerlari bor. User qatorlari o‘qilmadi, DDL/DML bajarilmadi. Bu PostgreSQL integratsion testi emas. |
| Migration uchun read-only preflight | PASS | Prerequisite, CHECK nomi va huquqlar | Kerakli oldingi markerlar, `telegram_otp_chat_check`, schema CREATE va ALTER target egaligi mavjud. Migrationlar bajarilmadi. |
| `node --test test/telegramAuthHardening.unit.test.js` | PASS | 11 PASS, 0 FAIL, 0 SKIP; offline mock | Ikki yangi test schema/permission/configuration sabablarini xavfsiz ajratish, raw secret/detail/IP log qilinmasligi, logger xatosida ham fail-closed bo‘lishini tekshiradi. Qolgan 9 ta test mavjud regressiya. |

Dastlab read-only script sandboxda `EPERM` oldi; DB ulanishi amalga oshmadi. Keyingi read-only tekshiruvlar sandbox tashqarisidagi ruxsat bilan muvaffaqiyatli bajarildi. Script `.env`ni faqat tasdiqlangan diagnostika doirasida xotirada o‘qidi; secretlar chiqarilmadi va fayl o‘zgartirilmadi. Real registration POST yoki limiter UPSERT diagnostika sifatida chaqirilmadi. Mavjud sxemada limiter query’sining jadval topolmasligi kod va katalog holati bilan tasdiqlandi.

O‘zgargan kod: `middleware/otpRateLimit.js` faqat belgilangan stage/reason bilan xavfsiz log qo‘shadi; public javob va xavfsizlik nazorati o‘zgarmadi. `test/telegramAuthHardening.unit.test.js`ga ikki tegishli test qo‘shildi. Sxema muammosi hali bartaraf etilmadi: read-only ruxsat migration yoki worker ishga tushirishni qamramaydi. To‘liq OTP ishlashi haqidagi da’vo yo‘q; keyingi aniq amallar `TELEGRAM_AUTH_HARDENING.md`da.

