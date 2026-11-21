# USTARA v217 — GitHub Actions muhitini qat'iy aniqlash

## Tekshirilgan qismlar
- `backend/scripts/v216-run-identity-guard.cjs` — run ID va attempt nazorati.
- `backend/scripts/v213-ci-provenance.cjs` — commit, repository, branch va workflow manbasi.
- `backend/scripts/v208-integration-exit-gate.cjs` — integratsiya jarayonini ishga tushirishdan oldingi tekshiruvlar.
- `backend/scripts/v197-verify-evidence.cjs` — dalil fayli tekshiruvi.
- `.github/workflows/v193-isolated-postgres-booking.yml` — faqat qo‘lda ishga tushadigan sinov.
- `AGENTS.md` — xavfsizlik va ruxsatlar qoidalari.

## Muammo
v216 orqali GitHub run ID/attempt tekshirilgan. Ammo `GITHUB_ACTIONS` umuman bo‘lmaganda,
faqat `GITHUB_SHA`, `GITHUB_REPOSITORY` yoki boshqa GitHub muhit belgisi mavjud bo‘lsa,
kod bu muhitni oddiy lokal ishga tushirish sifatida qabul qilishi mumkin edi. Bu ikki xil
provenance rejimini noaniq holatda qoldiradi.

## v217 yechimi
1. `backend/scripts/v217-ci-environment-mode.cjs` qo‘shildi.
2. Lokal rejimda GitHub identifikatorlari mavjud bo‘lsa, noaniq muhit rad etiladi.
3. `GITHUB_ACTIONS='false'`, bo‘sh yoki noto‘g‘ri qiymat ham lokalga avtomatik o‘tmaydi.
4. Haqiqiy `GITHUB_ACTIONS='true'` holatida avvalgi commit/workflow/run nazorati davom etadi.
5. Yangi nazorat subprocess boshlanishidan oldin va dalil faylini tekshirishda ishlaydi.
6. GitHub Actions workflow yangi offline unit-testni DB yaratilishidan oldin bajaradi.
7. Dastlabki GitHub trigger faqat `workflow_dispatch`; avtomatik push/PR trigger qo‘shilmadi.

## Amalda bajarilgan testlar
- Yangi v217 testlar: **11/11 muvaffaqiyatli**.
- v193–v217 bilan bog‘liq testlarni yagona `node --test` ishga tushirish: **225/225 muvaffaqiyatli**.
- JavaScript sintaksis tekshiruvi: **o‘tdi**.
- GitHub Actions YAML tuzilishi: **o‘tdi**.
- Arxiv yaxlitligi: ZIP tayyorlangach alohida tekshiriladi.

## Bajarilmagan sinovlar va chegaralar
- Haqiqiy PostgreSQL 18 bilan integratsiya sinovi bajarilmadi.
- Joriy muhitda `postgres`, `psql`, `docker` mavjud emas.
- `AGENTS.md` bo‘yicha migratsiya va bazaga yozuvchi amallar uchun alohida ruxsat kerak.
- GitHub'ga commit, push yoki workflow ishga tushirish qilinmadi.
- Lokal testlar production tayyorligini isbotlamaydi.

## Keyingi amaliy vazifa
O‘zgartirishlar alohida ko‘rib chiqilib, aniq ruxsat berilgach, GitHub Actions’da
faqat ajratilgan disposable PostgreSQL xizmatidagi migratsiya, booking concurrency
va cleanup sinovlarini bajarish kerak. Natijani haqiqiy CI log va artifact bilan tasdiqlash lozim.
