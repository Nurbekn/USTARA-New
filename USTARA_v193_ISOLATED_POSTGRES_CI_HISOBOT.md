# USTARA v193 — izolyatsiyalangan PostgreSQL CI sinoviga tayyorgarlik

## Maqsad

v192 dagi 29 ta `MODULE_NOT_FOUND` testini soxta shim bilan o'tkazmaslik; haqiqiy paketlar va **faqat vaqtinchalik PostgreSQL** yordamida bron vaqtlarining to'qnashuvini sinash uchun qo'lda ishga tushiriladigan GitHub Actions workflow yaratish.

## O'zgarishlar

- `.github/workflows/v193-isolated-postgres-booking.yml`: `workflow_dispatch` orqali **faqat qo'lda** ishga tushiriladigan job. GitHub Actions o'zining **qisqa muddatli PostgreSQL 18 container**ini yaratadi, alohida `ustara_test_db` bazasini va `ustara_account_test` (superuser EMAS) rolini tayyorlaydi. `btree_gist` admin sessiyasida o'rnatiladi, schema esa himoyalangan `bootstrap.sql` yordamida **container ichida loopback ulanishdan** quriladi. So'ng haqiqiy `bookingConcurrency.postgres.integration.test.js` ishlaydi. Ishlar test bazasigagina tegishli.
- `backend/scripts/v193-isolated-db-gate.cjs`: faqat `NODE_ENV=test`, aynan `ustara_test_db`, test roli va 127.0.0.1/::1 manzili, qo'lda fixture ruxsati va alohida test credential bo'lganda ishlashiga ruxsat beradi. Production/Telegram muhit o'zgaruvchilariga ruxsat bermaydi. Ulanmaydi, hech narsa o'zgartirmaydi.
- `backend/test/v193IsolatedDbGate.unit.test.js`: qo'riqchi va CI workflow uchun ijobiy/salbiy tekshiruvlar.
- `backend/package.json`: `v193:db:preflight`, `test:v193:unit`, `test:v193:db` buyruqlari. Dependency versiyalari va lockfile o'zgarmagan.

## Haqiqatan tekshirilgan holat

| Sinov | Natija | Cheklov |
|---|---|---|
| Yangi v193 unit testlari | 6/6 PASS | Offline |
| v192 + v193 maqsadli testlari | 11/11 PASS | Offline |
| Frontend to'liq unit-testlari | 1739/1739 PASS | Offline |
| Backend to'liq unit-testlari | 1790/1819 PASS | 29 ta paket yetishmasligi xatosi |
| `bootstrap-plan.js` | PASS | Hech qanday SQL bajarilmadi |
| Haqiqiy PostgreSQL 18 CI job | **NOT RUN** | GitHub'da workflow hali qo'lda ishga tushirilmagan |
| Telegram E2E, production build | **NOT RUN** | Test muhitida tegishli kutubxonalar/tashqi tizimlar yo'q |

29 ta yiqilgan test kod nuqsonlari yo'qligini isbotlamaydi. CI to'liq dependencies bilan o'tmaguncha ularni yopilgan deb hisoblamaymiz.

## Qanday ishga tushirish kerak

1. Loyihani GitHub repozitoriyga joylash va `.github/workflows/v193-isolated-postgres-booking.yml` ni commit qilish.
2. GitHub **Actions → USTARA v193 - opt-in isolated PostgreSQL booking concurrency → Run workflow** ni tanlash.
3. `booking-concurrency` job loglarini tekshirish. DB/bootstrap/integratsiya xatosi bo'lsa, fail holatida qoladi — u yashirilmaydi.
4. Uning natijasidan qat'i nazar, v192 `verified dependency quality gate`ni ham alohida ishga tushirish; u backendning **barcha** unit-testlari va frontend production build'ni tekshiradi.

Bu workflow haqiqiy production yoki staging bazasiga ulanmaydi va ularni boshqarmaydi. Parollar faqat GitHub'ning bir martalik xizmat containeri uchun oddiy test qiymatlaridir; haqiqiy sirlar ishlatilmaydi. Telegram xabarlari yuborilmaydi. Faqat bekor qilinadigan test hisoblari va bronlari yaratiladi. `psql` migratsiyalari faqat disposable `ustara_test_db` ichida qo'llanadi. Workflow GitHub Actions'da bajarilib, yashil natija bermaguncha real DB integratsiyasi tasdiqlangan emas.

## Yana nima qoladi

- Yangi CI job'ni real GitHub runner'da ishga tushirib, agar xato topsa tuzatish.
- v192 verified-dependencies job'ida 29 ta testning haqiqiy natijasini olish.
- Brauzer E2E, Telegram staging, migration/rollback, performance va production konfiguratsiyasini alohida tekshirish.

**185/185 manba auditi saqlangan**, biroq **LOYIHA TUGADI** degan xulosa hali asossiz.
