# USTARA v196 — tekshirilgan PostgreSQL concurrency evidence artifact

## Amalga oshirildi

- `backend/scripts/v196-integration-evidence.cjs` qo'shildi: Node TAP chiqishini avvalgi v195 qat'iy gate bilan tekshiradi, muvaffaqiyatli bo'lgandagina faqat agregat natija (`tests/pass/fail/skipped/cancelled/todo`), suite nomi, CI run identifikatorlari va TAP SHA-256 xeshini JSON sifatida yaratadi.
- Fayl faqat `backend/artifacts/v196-booking-integration-evidence.json` manziliga yaratiladi va mavjud fayl ustidan yozilmaydi; muvaffaqiyatsiz yoki to'liq bo'lmagan test natijasi dalil faylini yaratmaydi.
- `.github/workflows/v193-isolated-postgres-booking.yml` hali ham faqat `workflow_dispatch` orqali ishga tushadi. Bootstrap catalog proof'dan keyin `set -euo pipefail` bilan v196 gate ishga tushadi va tekshirilgan JSON GitHub Actions artifact sifatida 7 kunga saqlanadi.
- CI da hech qanday PostgreSQL production ma'lumotlari yoki Telegram tokenlari kerak emas; artifactda ulanish URL, parol va xom test output yo'q.
- `npm run test:v196:unit` 25/25 PASS (offline unit-testlar); `node --check` syntax test ham o'tgan.

## Muhim cheklovlar

- Haqiqiy PostgreSQL disposable integratsiya testlari bu muhitda **NOT RUN**. CI workflow GitHub Actions'da qo'lda ishga tushirilmaguncha haqiqiy test/artifact dalili mavjud emas. Xesh o'zi mustaqil DB tekshiruvi emas, faqat bajarilgan TAP chiqishini identifikatsiya qiladi.
- Production deploy, rollback, Telegram staging va end-to-end hosting testlari **NOT RUN**.
- Migration SQL, booking business logic va production konfiguratsiyasi o'zgartirilmadi.
- **LOYIHA TUGADI** emas; avval real PostgreSQL integratsiya workflow sinovi va staging validation kerak.
