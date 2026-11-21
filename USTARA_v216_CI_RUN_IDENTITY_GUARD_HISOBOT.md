# USTARA v216 — GitHub CI run identifikatorlari va dalil fayli mosligi

## 1. Ko‘rilgan fayllar
- `.github/workflows/v193-isolated-postgres-booking.yml` — faqat `workflow_dispatch` bilan ishga tushadigan ajratilgan PostgreSQL 18 CI job.
- `backend/scripts/v208-integration-exit-gate.cjs` — yozuvchi concurrency testini ishga tushiruvchi runner.
- `backend/scripts/v197-verify-evidence.cjs` — dalil fayli tekshiruvchisi.
- `backend/scripts/v213-ci-provenance.cjs` — commit, repository va workflow manbasi tekshiruvi.
- `backend/test/v208IntegrationExitGate.unit.test.js` va `backend/test/v209SafeProcessLogging.unit.test.js` — eski offline CI simulyatsiyasi.

## 2. Aniqlangan muammo
v215 da commit/workflow manbasi va GitHub run ID/attempt alohida tekshirilardi. `v208` runner manbani tekshirgan, ammo GitHub run ID yoki attempt yo‘qligi/noto‘g‘riligini **yozuvchi test subprocessi boshlanishidan oldin** tekshirmagan. Natijada dalil yaratib bo‘lmaydigan holatda test keraksiz ishga tushishi mumkin edi. Bundan tashqari, offline dalilda lokal manba bilan raqamli GitHub run ID aralashgan JSON tekshiruvdan o‘tishi mumkin edi.

## 3. Kiritilgan tuzatishlar
1. `backend/scripts/v216-run-identity-guard.cjs` qo‘shildi: `ciRunId`, `ciRunAttempt` va commit/workflow manbasi bir xil rejimda (`local/local` yoki to‘liq raqamli CI identifikatorlari) bo‘lishini nazorat qiladi.
2. `v208` runner bu nazoratni **TAP testini boshlashdan oldin** bajaradi. Haqiqiy GitHub Actions muhitida ID yoki attempt bo‘lmasa, xato formatda bo‘lsa yoki `local` bo‘lsa, mutatsion concurrency test boshlanmaydi.
3. `v197` verifier lokal/CI aralash metadata bilan yozilgan dalil faylini rad etadi. Verifierning mavjud commit/workflow va SHA-256 tekshiruvlari saqlandi.
4. v208 va v209 offline testlaridagi soxta GitHub konteksti to‘liq commit/repository/ref/workflow manbasi bilan to‘ldirildi — eski testlarning asl maqsadi saqlandi.
5. `backend/test/v216EvidenceRunIdentity.unit.test.js` — 11 ta yangi regression-test qo‘shildi.
6. CI workflow’ga yangi unit-test qadami ma’lumotlar bazasi yaratishdan **oldin** qo‘shildi. Artifact nomi v216 ga yangilandi.
7. Barcha tarixiy SQL migratsiyalar va foydalanuvchi ma’lumotlariga tegilmadi.

## 4. Aslida bajarilgan testlar
- `npm run test:v213:unit`: **182/182 passed**.
- `npm run test:v214:unit`: **12/12 passed**.
- `npm run test:v215:unit`: **9/9 passed**.
- `npm run test:v216:unit`: **11/11 passed**.
- **Jami 214 ta lokal unit-test o‘tdi** (bir-birini takrorlamaydigan to‘plamlar).
- O‘zgargan 6 ta JavaScript faylga `node --check` qo‘llandi: **o‘tdi**.
- GitHub Actions workflow sintaksisi va `workflow_dispatch` / gate tartibi PyYAML bilan tekshirildi: **o‘tdi**.
- `bootstrap-plan.js` offline rejimda 63 ta forward SQL migratsiyani (66 ta include ichida) tekshirdi: **o‘tdi**.

## 5. Cheklovlar
- Docker, PostgreSQL serveri va `psql` bu muhitda yo‘q. Hech qanday real PostgreSQL integratsiya testi, SQL migratsiyasi yoki DB yozish amali bajarilmadi.
- `backend` bog‘liqliklari o‘rnatilmaganligi uchun to‘liq ilova integratsiya testlari bu yerda ishga tushirilmadi; yuqoridagi unit-testlar Node.js ichki imkoniyatlari bilan bajarildi.
- GitHub Actions workflow amalda ishga tushirilmadi. Repozitoriyga kod yuborilmadi.
- GitHub CI identifikatorlari bir-biriga mosligi tekshiriladi, ammo ular kriptografik raqamli imzo emas. Offline tekshiruv production tayyorligini tasdiqlamaydi.
- `AGENTS.md` bo‘yicha SQL migratsiyalari yoki bazaga yozuvchi sinovlar uchun oldindan foydalanuvchi ruxsati talab qilinadi.

## 6. Keyingi aniq ish
Ajratilgan PostgreSQL 18 GitHub Actions workflow’ni faqat foydalanuvchi ruxsati bilan repozitoriyga joylash va **qo‘lda** ishga tushirish; haqiqiy migratsiya, permission, booking concurrency va postflight natijalarini ko‘rib chiqish. Shu sinovlarsiz production tayyorligi tasdiqlanmaydi.
