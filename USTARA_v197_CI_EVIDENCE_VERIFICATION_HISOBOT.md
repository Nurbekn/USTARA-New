# USTARA v197 — PostgreSQL CI evidence verification

## O'zgarishlar

- `backend/scripts/v197-verify-evidence.cjs`: v196 JSON artifact uchun qat'iy schema, muhim passing counts, TAP fingerprint format, sonlar va CI run/attempt identity tekshiruvi. Faqat belgilangan `backend/artifacts/v196-booking-integration-evidence.json` tekshiriladi; symlink va ortiqcha hajmdagi fayl rad etiladi.
- `.github/workflows/v193-isolated-postgres-booking.yml`: artifact upload oldidan mustaqil v197 verification step; manual `workflow_dispatch` cheklovi saqlanadi.
- `backend/test/v197EvidenceVerification.unit.test.js`: 5 ta yangi unit-test, jumladan CI replay/mismatch, soxta schema, counters, symlink va workflow order tekshiruvlari.
- `backend/package.json`: `npm run test:v197:unit` komandasi.

## Lokal natija

- `npm run test:v197:unit`: **30/30 PASS** (offline, fake TAP fixture va file-system testlari).
- Haqiqiy PostgreSQL: **NOT RUN** (bu muhitda `psql` va `docker` yo'q).
- GitHub Actions workflow: **NOT RUN**; real CI artifact hali yo'q.
- Production va hosting deploy: **NOT RUN**.

## Scope va cheklov

Bu tekshiruv JSON faylning strukturasi, expected suite va faol CI run/attempt ga tegishliligini tasdiqlaydi. SHA-256 faqat TAP chiqishining fingerprinti, o'zi mustaqil ravishda database testni isbotlamaydi. Real disposable PostgreSQL tasdig'i uchun GitHub'da `USTARA v193 - opt-in isolated PostgreSQL booking concurrency` workflow'ni qo'lda ishga tushirib, barcha bosqichlarning yashil yakunlanishini tekshirish kerak. SQL migration va production kodlar o'zgartirilmadi.

**LOYIHA TUGADI emas.**
