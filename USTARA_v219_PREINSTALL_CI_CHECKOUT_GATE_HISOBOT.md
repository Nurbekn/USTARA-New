# USTARA v219 — CI identifikatori va commitni npm o‘rnatishdan oldin tekshirish

## Tekshirilgan qismlar

- `AGENTS.md`: baza, migratsiya va production ma'lumotlarini ruxsatsiz o‘zgartirmaslik qoidasi.
- `.github/workflows/v193-isolated-postgres-booking.yml`: faqat `workflow_dispatch` orqali ishlaydigan PostgreSQL 18 test workflow'i.
- `backend/scripts/v213-ci-provenance.cjs`, `v216-run-identity-guard.cjs`, `v218-prebootstrap-ci-gate.cjs`: mavjud CI manba, urinish va qo‘lda ishga tushirish talablari.
- `backend/database/bootstrap.sql`: 63 ta migratsiyani o‘z ichiga oladigan mavjud reja.

## Muammo

v218 workflow'ida `npm ci` va unit-testlar **GitHub identifikatori hamda checkout qilingan commit tekshirilishidan avval** ishlardi. `npm ci` paket lifecycle skriptlarini bajara oladi. Shuning uchun noto‘g‘ri CI kontekstida keraksiz kodni avval ishlatib, xatoni faqat keyin aniqlash ehtimoli mavjud edi.

## v219 tuzatishlari

1. `backend/scripts/v219-preinstall-ci-gate.cjs` yaratildi. U **faqat Node.js built-in modullaridan** foydalanadi; npm paketlari, `.env`, SQL yoki tarmoq talab qilmaydi.
2. Skript `v218` orqali manual GitHub Actions identifikatori, run ID, urinish, commit, repository va workflow manbasini tekshiradi.
3. `GITHUB_WORKSPACE` haqiqiy loyiha ildiziga mosligi `realpathSync` orqali tekshiriladi.
4. `git rev-parse --verify HEAD` faqat argumentlar bilan, shellsiz bajariladi va natija `GITHUB_SHA` bilan solishtiriladi.
5. CI gate `npm ci` dan **oldinga** ko‘chirildi; baza yaratilishidan oldin takroriy tekshiruv saqlandi.
6. `test:v219:unit` orqali 8 ta yangi regression-test qo‘shildi; v213/v218 workflow tartibiga bog‘liq eski ikkita test moslashtirildi.
7. CI artefakt nomi v219 ga o‘zgartirildi. Migratsiyalar, schema, real baza ma'lumotlari o‘zgarmadi.

## Amalda bajarilgan offline testlar

| Sinov | Natija |
|---|---:|
| `npm run test:v213:unit` | 182/182 |
| `npm run test:v214:unit` | 12/12 |
| `npm run test:v215:unit` | 9/9 |
| `npm run test:v216:unit` | 11/11 |
| `npm run test:v217:unit` | 11/11 |
| `npm run test:v218:unit` | 9/9 |
| `npm run test:v219:unit` | 8/8 |
| **Jami lokal unit-testlar** | **242/242** |

- JavaScript sintaksisi: `node --check` bilan tekshirildi.
- Workflow YAML va bosqichlari: offline tekshiruv bajariladi.
- `bootstrap.sql` migratsiyalar ro‘yxati: o‘zgarishsiz, **63 ta**.
- ZIP arxivi: yaratilganidan so‘ng yaxlitligi tekshiriladi.

## Tasdiqlanmagan holatlar va cheklovlar

- ZIP ichida `.git` katalogi yo‘q. Real `git HEAD` mosligi faqat GitHub checkout qilingan ishchi muhitda tekshiriladi; unit-testda u stub orqali sinovdan o‘tgan.
- `postgres`, `psql` va Docker ushbu muhitda mavjud emas. Haqiqiy PostgreSQL 18 integratsiya testi bajarilmadi.
- GitHub Actions workflow ishga tushirilmadi; repo'ga push qilinmadi.
- Production/staging tayyorligi tasdiqlanmagan.
- PostgreSQL service konteynerini GitHub Actions ish boshlanishidan oldin yaratishi mumkin; yangi gate **npm install va SQL amallari** uchun oldingi qo‘shimcha nazorat, butun job/service ishga tushishining oldini olish da'vosi emas.

## Keyingi ruxsat talab qiladigan bosqich

Foydalanuvchining aniq ruxsati va workflow'ni GitHub'da joylash imkoni bo‘lgach, faqat ajratilgan disposable test bazasi uchun manual integratsiya sinovini ishga tushirish va haqiqiy log/evidence natijasini ko‘rish kerak. Production bazasi yoki shaxsiy ma'lumotlar ishlatilmasin.
