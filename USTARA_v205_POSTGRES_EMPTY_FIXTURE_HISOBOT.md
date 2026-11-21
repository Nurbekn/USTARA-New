# USTARA v205 — PostgreSQL fresh-fixture safety proof

## Maqsad

v204 dan keyin faqat qo'shimcha TAP hisobot qoidalarini yozish o'rniga,
**haqiqiy PostgreSQL booking concurrency sinovlari boshlanishidan oldin** alohida
CI bazasi bo'sh ekanini qayta tekshirish.

## O'zgarishlar

- `backend/scripts/v205-empty-fixtures-proof.cjs` — maxsus v193 ruxsatini
  ulanishdan **oldin** tekshiradi; faqat `BEGIN READ ONLY` bilan ishlaydi;
  `ustara_test_db`, `ustara_account_test`, `public` va `transaction_read_only=on`
  bo'lishini talab qiladi; 12 ta manbasi ma'lum jadval uchun faqat `EXISTS`
  qaytaruvchi SQL ishlatadi. Eski yozuv yoki noma'lum natija bo'lsa xatolik.
  Har doim `ROLLBACK` bilan yakunlashga urinadi.
- `backend/test/v205EmptyFixturesProof.unit.test.js` — 12 ta regression-test.
- `backend/package.json` — yangi `npm run test:v205:unit` buyrug'i.
- `.github/workflows/v193-isolated-postgres-booking.yml` — manual CI
  oqimida yangi preflight PostgreSQL runtime proof'dan so'ng va mutatsion
  concurrency testlaridan oldin.
- Oldingi v198 va v203 unit-testlari yangi CI buyruq nomiga moslashtirildi.

## Tekshiriladigan jadvallar

`users`, `customers`, `barbers`, `services`, `bookings`, `booking_services`,
`barber_working_hours`, `barber_weekly_breaks`, `barber_date_breaks`,
`booking_checkins`, `customer_telegram_links`,
`customer_booking_telegram_outbox`.

`admin_accounts` va `smart_booking_admin_settings` ataylab kiritilmagan:
bootstrap yangi bazada ularga dastlabki qatorlarni yaratadi. Boshqa
jadval va butun migration katalogi esa oldingi `bootstrap/verify.sql` va
v194 isbotlarida tekshiriladi.

## Haqiqiy mahalliy tekshiruv natijasi

- Node.js 22 orqali `npm run test:v205:unit`: **99/99 o'tdi**, 0 failure,
  0 skip; barchasi offline/mock yoki sintaksis tekshiruvlaridir.
- Yangi ikki JavaScript faylining `node --check` tekshiruvi: **o'tdi**.
- GitHub Actions YAML parsing va bosqich tartibi: **o'tdi**.
- **PostgreSQL haqiqiy integratsiya testi bajarilmadi.** Ushbu sessiya
  konteynerida `docker`, `psql` va PostgreSQL server mavjud emas.
  99/99 natija PostgreSQL concurrency sinovi muvaffaqiyatli o'tganini anglatmaydi.

## PostgreSQL real CI sinovini bajarish

1. ZIP ichidagi `USTARA-New` loyihasini GitHub reposining root qismiga
   qo'ying; `.github/workflows` papkasini ham qo'shing.
2. GitHub > Actions > **USTARA v193 - opt-in isolated PostgreSQL booking concurrency** >
   **Run workflow** tugmasidan qo'lda ishga tushiring (default branchda workflow bo'lishi kerak).
3. CI'da bootstrap, v194 katalog proof, v198 runtime proof,
   **v205 fresh-fixture proof** va 12 ta booking subtest bajarilishi kerak.
4. Muvaffaqiyatli run uchun `ustara-v197-verified-booking-integration-evidence`
   artifact paydo bo'ladi. U 7 kun saqlanadi. Run loglari va artifactni
   qayta ko'rmasdan productionga tayyor deb baholamang.

`workflow_dispatch` dan tashqari trigger yo'q: avtomatik push, PR yoki
schedule bu ma'lumot o'zgartiruvchi testni ishga tushirmaydi. CI ichidagi
faqat shu run davomida yashovchi test parollari production loginlar emas.

## Status

**v205 kod va offline testlar tayyor. Real PostgreSQL va production tasdiqlanmagan.
LOYIHA TUGADI deyilmaydi.**
