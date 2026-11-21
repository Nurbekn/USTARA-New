# USTARA v206 — PostgreSQL post-run cleanup proof

## Maqsad

v205 test boshlanishidan oldin disposable PostgreSQL bazasi bo'shligini
tekshiradi. v206 real booking concurrency testi va uning `t.after` cleanup'i
tugagach **test jadvali yozuvlari qolmaganini** tasdiqlash uchun alohida,
yozish huquqidan foydalanmaydigan postflight tekshiruvini qo'shadi.

## Kiritilgan o'zgarishlar

- `backend/scripts/v206-postrun-cleanup-proof.cjs` — v193 maxsus test
  autorizatsiyasini DB ulanishidan oldin tekshiradi. Birinchi amal
  `BEGIN READ ONLY`; yagona snapshot SELECT'ida 14 ta jadvalni
  `EXISTS(... LIMIT 1)` orqali tekshiradi, to'g'ri baza/rol/schema/read-only
  holatiga ishonch hosil qiladi va `ROLLBACK` bilan yakunlaydi.
- Tekshiriladigan 14 jadval: v205 dan 12 ta (users, customers, barbers,
  services, bookings, booking_services, barber_working_hours,
  barber_weekly_breaks, barber_date_breaks, booking_checkins,
  customer_telegram_links, customer_booking_telegram_outbox), shuningdek
  `booking_request_keys` va `customer_telegram_link_tokens`.
- Bootstrap tomonidan ataylab seed qilingan `admin_accounts` va
  `smart_booking_admin_settings` bo'sh bo'lishi talab etilmaydi.
- `backend/test/v206PostrunCleanupProof.unit.test.js` — postflight
  tekshiruvi uchun 11 ta regressiya testi. Noto'g'ri rol/baza, qolib ketgan
  yozuv, SQL xatosi, ikki xil snapshot va ruxsatsiz ulanish rad etiladi.
- `backend/package.json`: yangi `npm run test:v206:unit` buyrug'i eski
  99 unit-test va yangi 11 ta testni bajaradi.
- `.github/workflows/v193-isolated-postgres-booking.yml`: v206 postflight
  concurrency testi tugagandan keyin, evidence verifikatsiyasi va artifact
  upload'dan oldin, **manual-only** workflow'ga qo'shildi. Agar postflight
  muvaffaqiyatsiz bo'lsa, keyingi evidence verifikatsiyasi va upload
  bajarilmaydi. Maxfiy credential yoki xom TAP artifactga kirmaydi.

## Shu sessiyada bajarilgan tekshiruvlar

- `npm run test:v206:unit` (Node.js 22): **110/110 passed**, 0 failed,
  0 skipped; barcha natijalar lokal offline unit-testlarga tegishli.
- `node --check` yangi script va testda: **PASS**.
- YAML parse: **PASS**; `workflow_dispatch` saqlangan, postflight to'g'ri
  joylashtirilgan.
- ZIP tarkibi va yaxlitligi qadoqlash paytida tekshirilgan.

## Qolgan real tasdiq

- Ushbu muhitda `postgres`, `pg_ctl`, `psql` yoki `docker` mavjud emas.
- **Haqiqiy PostgreSQL integratsiya testi ishlatilmadi.** v206 faqat
  kelgusida GitHub Actions'da test cleanup muvaffaqiyatli yakunlanganini
  tekshirish imkonini qo'shadi.
- GitHub Actions'dagi `USTARA v193 - opt-in isolated PostgreSQL booking
  concurrency` workflow'ni **Run workflow** orqali qo'lda ishga tushirish
  kerak. Faqat run log, v206 postflight va v197 evidence to'liq o'tgandan
  keyin CI integratsiya natijasi tasdiqlanadi.
- Bularning hech biri production muhitga tayyorlikning to'liq dalili emas.

**Status: v206 kod va offline testlar tayyor; real PostgreSQL va production
tekshiruvlari o'tkazilmagan. LOYIHA TUGADI deyilmaydi.**
