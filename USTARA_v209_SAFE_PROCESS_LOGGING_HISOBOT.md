# USTARA v209 — Safe PostgreSQL CI Process Logging

Sana: 2026-11-21

## Maqsad

v208 disposable PostgreSQL booking concurrency integratsiya runner'i subprocess stdout (xom TAP) va stderr xabarlarini `echo: true` orqali GitHub Actions logiga uzatardi. Xatolik diagnostikasi test ma'lumotlari yoki ulanish tafsilotlarini o'z ichiga olishi mumkin. v209 maqsadi bu oqimlarni loglardan ajratish, standart xato oqimining hajmini cheklash va test muvaffaqiyatini avvalgidek qat'iy tekshirish.

## O'zgarishlar

- `backend/scripts/v208-integration-exit-gate.cjs`: test subprocess stdout'ini faqat xotirada 4,000,000 baytgacha yig'adi; stdout/stderr oqimlarini CI logiga qayta yozmaydi. 32,768 baytdan ko'p stderr bo'lsa subprocess `SIGKILL` bilan to'xtatiladi va natija rad etiladi. Exit code, signal, 150 soniya timeout, strict TAP va 12 ta case tekshiruvlari saqlangan. Eski `echo` parametri e'tiborsiz qoldiriladi.
- `.github/workflows/v193-isolated-postgres-booking.yml`: offline unit bosqich endi `npm run test:v209:unit` ni bajaradi. Real DB testi, read-only preflight/postflight va faqat `success()` da dalil yuklash tartibi saqlangan.
- `backend/package.json`: `test:v209:unit` scripti qo'shildi; v208 scripti saqlangan.
- `backend/test/v209SafeProcessLogging.unit.test.js`: 8 ta yangi offline regression-test.
- Oldingi 6 ta testning qat'iy workflow-versiya assertionlari `v209` ga moslandi; ularning asl xavfsizlik shartlari saqlandi.

## Tekshiruvlar

- `cd backend && npm run test:v209:unit`: **141/141 PASS**, fail=0, skipped=0.
- Tegishli JavaScript manbalarda `node --check`: PASS.
- GitHub Actions YAML sintaksisi va manual trigger: tekshirildi.
- ZIP tarkibi va CRC: tekshiriladi.
- Haqiqiy PostgreSQL 18 integratsiya sinovi: **BAJARILMADI**. Mazkur muhitda PostgreSQL server va Docker yo'q.

## Cheklovlar va keyingi aniq qadam

Bu o'zgarishlar faqat GitHub Actions workflow ZIP ichidan repoga joylanganida ishlaydi. GitHub'ga hech narsa push qilinmadi. Real CI jobini ishga tushirish uchun avval repository'da `.github/workflows/v193-isolated-postgres-booking.yml` va `backend/` mavjudligini tasdiqlash, keyin **Actions > USTARA v193 - opt-in isolated PostgreSQL booking concurrency > Run workflow** orqali qo'lda ishga tushirish kerak. Agar job xato bersa, faqat sanitizatsiyalangan xato holati logga chiqadi; xom TAP ni xavfsiz test muhitida alohida tekshirish mumkin.

**LOYIHA TUGADI** deb belgilash uchun hali real DB integratsiya, deploy va production xavfsizlik tekshiruvlari zarur.
