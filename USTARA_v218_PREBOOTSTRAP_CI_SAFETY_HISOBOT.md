# USTARA v218 — PostgreSQL migratsiyalaridan oldingi CI xavfsizlik nazorati

## 1. Tekshirilgan qismlar

- `AGENTS.md` — ruxsatsiz migratsiya va haqiqiy bazaga ulanishni taqiqlovchi loyiha qoidalari.
- `.github/workflows/v193-isolated-postgres-booking.yml` — `workflow_dispatch` bilan qo‘lda ishga tushadigan disposable PostgreSQL 18 sinovi.
- `backend/scripts/v213-ci-provenance.cjs`, `v216-run-identity-guard.cjs`, `v217-ci-environment-mode.cjs` — CI manbasi, run ID, urinish va lokal/CI rejimlari nazorati.
- `backend/scripts/v198-postgres-runtime-proof.cjs` — PostgreSQL 18, test roli va read-only katalog nazorati.
- `backend/database/bootstrap.sql` — 63 ta mavjud migratsiya ro‘yxati, **o‘zgartirilmadi**.

## 2. Aniqlangan xavf

Avvalgi workflow GitHub commit va workflow manbasini baza yaratilishidan oldin tekshirgan, ammo **run ID va urinish raqami** faqat booking concurrency testi ishga tushirilishi oldidan tekshirilgan. Shu sabab CI identifikatorlari noto‘g‘ri bo‘lsa ham, vaqtinchalik baza allaqachon yaratilib, migratsiyalar bajarilishi mumkin edi. PostgreSQL 18 va test roliga oid tekshiruv ham migratsiyalardan **keyin** edi.

## 3. Kiritilgan tuzatishlar

1. `backend/scripts/v218-prebootstrap-ci-gate.cjs`: GitHub Actions’ning qo‘lda ishga tushirilgan workflow, commit, repository, branch/tag, run ID va attempt qiymatlarini **baza yaratishdan oldin** tekshiradi. Lokal yoki noto‘g‘ri belgilangan muhit rad etiladi. SQL, tarmoq va `.env` o‘qilishi yo‘q.
2. `backend/scripts/v218-prebootstrap-runtime-proof.cjs`: mavjud `v198` read-only PostgreSQL 18 tekshiruvini qayta ishlatadi, lekin **63 ta migratsiya boshlanishidan oldin** bajaradi. Baza egasi, cheklangan rol, `btree_gist` extension va PostgreSQL versiyasi tekshiriladi. `BEGIN READ ONLY` / `ROLLBACK` saqlanadi.
3. GitHub Actions workflow’ga yangi offline test bosqichi va ikkita preflight nazorati qo‘shildi. Migratsiyalardan **keyingi** `v194` va `v198` tekshiruvlari ham saqlangan.
4. `backend/package.json`ga `test:v218:unit` buyrug‘i, `backend/test/v218PrebootstrapSafety.unit.test.js`ga 9 ta regression-test qo‘shildi.
5. Dalil fayli artefakt nomi v218 ga moslashtirildi. Dalil sxemasi va tegishli dastur kodlari o‘zgarmadi.

## 4. Haqiqatan bajarilgan tekshiruvlar

| Test to‘plami | Natija |
|---|---:|
| `npm run test:v213:unit` | 182 / 182 |
| `npm run test:v214:unit` | 12 / 12 |
| `npm run test:v215:unit` | 9 / 9 |
| `npm run test:v216:unit` | 11 / 11 |
| `npm run test:v217:unit` | 11 / 11 |
| `npm run test:v218:unit` | 9 / 9 |
| **Jami lokal unit-testlar** | **234 / 234** |

- Uchta yangi JavaScript faylning sintaksisi `node --check` orqali tasdiqlandi.
- Workflow YAML Python YAML parser orqali tekshirildi: yagona trigger `workflow_dispatch`.
- Workflow bosqichlari tartibi offline tasdiqlandi.
- `bootstrap.sql`dagi migratsiya yo‘llari soni: **63** (tahrirlanmagan).
- ZIP arxivining yaxlitligi paket yaratilgach alohida tekshiriladi.

## 5. Hali tasdiqlanmagan holatlar

- Bu muhitda `docker`, `postgres` va `psql` mavjud emas. Shuning uchun PostgreSQL’ga real ulanish, migratsiyalar va booking concurrency integratsiya sinovi bajarilmadi.
- Testdagi mock PostgreSQL snapshot — haqiqiy server dalili emas.
- GitHub Actions workflow repozitoriyga yuborilmadi va ishga tushirilmadi.
- Production/staging tayyorligi tasdiqlanmagan.

## 6. Xavfsizlik va keyingi qaror

`AGENTS.md`ga muvofiq baza yozuvlari yoki migratsiyalarini bajarish uchun foydalanuvchining **aniq ruxsati** kerak. Ruxsatdan keyin workflow’ni faqat GitHub’ning ajratilgan disposable PostgreSQL test xizmati bilan ishga tushirish, haqiqiy job loglari va dalil artefaktini tekshirish, keyin alohida staging E2E sinovlarini bajarish kerak. Hech qanday production ma’lumoti ishlatilmasligi lozim.
