# USTARA v204 — PostgreSQL Docker transport mosligi va huquqlar nazorati

## Tekshirilgan asos
- v203 ZIP ichidagi `.github/workflows/v193-isolated-postgres-booking.yml`.
- `backend/scripts/v193-isolated-db-gate.cjs`: faqat ruxsat etilgan lokal test URL / DB / rol.
- `backend/scripts/v198-postgres-runtime-proof.cjs`: haqiqiy PostgreSQL server identifikatori va huquqlarini `BEGIN READ ONLY` ichida tekshirish.
- `backend/test/v198PostgresRuntimeProof.unit.test.js` va v203 testlar to'plami.

## Aniqlangan muammo
CI'da `node` GitHub runner tizimida ishlab, PostgreSQLga Docker'ning host porti (`127.0.0.1:5432`) orqali ulanadi. Ammo `inet_server_addr()` **server tomondagi** lokal IP'ni qaytaradi. Docker bridge rejimida bu ko'pincha `172.17.x.x` yoki `172.18.x.x` bo'ladi, `127.0.0.1` emas. v198 dagi `server_addr === '127.0.0.1'` qattiq sharti qonuniy, to'liq ajratilgan CI xizmatini ham xato deb rad etishi mumkin edi.

## v204 o'zgarishlari
1. `backend/scripts/v198-postgres-runtime-proof.cjs`dagi server IP tekshiruvi Docker'ning RFC1918 manzillari va lokal IPv6 manzillarini qo'llab-quvvatlaydi; yaroqsiz, wildcard va public endpointlar rad etiladi.
2. **Xavfsizlik chegarasi o'zgarmadi**: tarmoqqa ulanishdan oldin `v193-isolated-db-gate` faqat loopback test URL, `ustara_test_db`, `ustara_account_test`, `NODE_ENV=test`, eksplicit fixture ruxsati va production muhit o'zgaruvchilari yo'qligini tekshiradi.
3. Haqiqiy DB egasi, session/current user, PostgreSQL 18, superuser va boshqa ortiqcha rol ruxsatlari, `btree_gist`, `READ ONLY` tranzaksiya kabi tekshiruvlar o'zgarishsiz qoldi.
4. `backend/test/v204DockerRuntimeAddress.unit.test.js` — Docker bridge IP, turli xususiy manzillar, IPv6, xavfli IP, rol cheklovlari, `ROLLBACK` va remote URL bloklanishini tekshiradigan 7 ta yangi regression-test.
5. Eski v198 testdagi noto'g'ri `10.0.0.1` rad etilishi kutilmasi `8.8.8.8` bilan almashtirildi (10.x.x.x — Docker ishlatishi mumkin bo'lgan RFC1918 diapazoni).
6. `backend/package.json`da `test:v204:unit` qo'shildi, manual CI workflow shu testlardan foydalanadi. v198 va v203 workflow assertion-testlari yangilandi.
7. Hech qanday tarixiy migratsiya yoki haqiqiy ma'lumotlar bazasi o'zgartirilmagan.

## Amalda bajarilgan tekshiruvlar
- `cd backend && npm run test:v204:unit`: **87 ta test, 87 passed, 0 failed, 0 skipped**.
- O'zgargan JavaScript sintaksisi `node --check`: **muvaffaqiyatli**.
- GitHub Actions YAML lokal parserdan o'tdi.
- ZIP tarkibi / yaxlitligi alohida tekshirildi (paket tayyorlash vaqtida).

## Qolgan cheklovlar va keyingi qadam
- Bu sinovda PostgreSQL serveri, `psql` va Docker mavjud emas; **haqiqiy Postgres, migratsiya va concurrency integratsiya testi bajarilmadi**.
- Foydalanuvchi kodni o'z GitHub repozitoriysiga joylashtirgach, `Actions` -> `USTARA v193 - opt-in isolated PostgreSQL booking concurrency` -> `Run workflow` ni qo'lda ishga tushirishi mumkin. Ushbu mavjud workflow faqat vaqtinchalik test bazasini yaratishga mo'ljallangan; production bazasiga tegmasligi kerak.
- Workflow `v194` migratsiya katalogi, `v198` read-only runtime, v203 real TAP coverage va `v197` dalil fayli tekshiruvidan o'tsa, 7 kun saqlanadigan CI artifact yuklaydi.
- Barcha real sinovlar muvaffaqiyatli bo'lmaguncha production tayyorligi va `LOYIHA TUGADI` tasdiqlanmaydi.
