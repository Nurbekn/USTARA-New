# USTARA v210 — PostgreSQL CI subprocess-tree containment

Sana: 2026-11-21  
Asos: `USTARA-v209-Safe-Postgres-CI-Process-Logging.zip`

## Muammo

v209 `backend/scripts/v208-integration-exit-gate.cjs` timeout yoki TAP/stderr hajmi oshganda faqat asosiy test jarayoniga `SIGKILL` yuborardi. Node `--test` ichki worker jarayonlarni yaratishi mumkin. Ularning stdout/stderr pipe descriptorlari tirik qolsa, ota jarayon tugagandan keyin ham CI runner `close` hodisasini kutib qolishi yoki testdagi PostgreSQL ulanishlari uzilmasligi mumkin.

## Bajarilgan ishlar

1. POSIX/Linux uchun `spawn(... detached: true)` orqali test jarayoniga mustaqil process group berildi; `shell: false` va stdin/stdout/stderr xavfsizlik shartlari saqlandi.
2. Timeout, ortiqcha TAP va ortiqcha stderr paytida `process.kill(-pid, 'SIGKILL')` orqali **o'sha process group ichidagi** jarayonlar to'xtatiladi. Windows uchun asosiy child jarayonini to'xtatish fallback saqlandi.
3. Agar stdout/stderr ni meros olgan jarayon sabab `close` hodisasi kelmasa, 1500 ms grace watchdog promise'ni xato bilan yakunlaydi, streamlarni yopadi va child ref'ini bo'shatadi.
4. Xom TAP/stderr CI loglariga yozilmaydi. 4 MB TAP, 32 KB stderr, 150 sekundlik test timeout o'zgarmadi. Haqiqiy TAP/case coverage, exit code, dalil xeshi va `success()` artifact gate saqlandi.
5. `backend/test/v210ProcessGroupContainment.unit.test.js` — 8 ta yangi test. Ulardan 3 tasi haqiqiy subprocess va inherited stdout'ga ega grandchild yaratib, timeout, erta ota-jarayon exit va TAP overflow holatida grandchild keyinroq yozmoqchi bo'lgan marker fayl yaratilmasligini tekshiradi.
6. `backend/package.json` da `test:v210:unit` qo'shildi, eski scriptlar saqlandi; `.github/workflows/v193-isolated-postgres-booking.yml` unit-test qadamida v210 ishga tushiriladi.
7. Workflow nomini qat'iy v209 deb tekshirgan oldingi 7 ta testning versiya assertioni v210 ga yangilandi. Ularning xavfsizlik kontrakti o'zgarmadi.

## Sinovlar

- `cd backend && npm run test:v210:unit` — **149/149 PASS**, fail=0, skip=0, 8 ta yangi test.
- `node --check` — o'zgargan JS fayllar uchun PASS.
- GitHub Actions workflow YAML parsing va manual-only trigger tekshiriladi.
- ZIP CRC va fayl soni — paket yaratish vaqtida tekshiriladi.
- **Haqiqiy PostgreSQL 18 bazasi bilan migratsiya/concurrency:** NOT RUN; bu konteynerda Docker, PostgreSQL server yoki psql yo'q, apt repozitoriy DNS ham mavjud emas.
- GitHub Actions runner: NOT RUN; GitHub repozitoriysiga hech narsa push qilinmadi.
- Frontend build, browser E2E, Telegram va production: NOT RUN.

## Cheklov / keyingi qadam

Bu himoya oddiy Node test workerlarini (POSIX process group ichidagilarni) qamrab oladi; alohida session yaratgan begona jarayonlarni cgroup/sandbox darajasida cheklashni almashtirmaydi. CI'dagi `postgres:18-alpine` xizmatida real testni tasdiqlash uchun foydalanuvchi kodni GitHub'ga joylagach, manual `workflow_dispatch` ni ishga tushirish kerak. Yashil lokal unit-test production tayyorligini tasdiqlamaydi. **LOYIHA TUGADI** holati hali berilmaydi.
