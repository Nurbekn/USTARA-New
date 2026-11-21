# USTARA v220 — CI source-tree integrity preflight

## Ko‘rib chiqildi
- v219 arxivi asosidagi `.github/workflows/v193-isolated-postgres-booking.yml`.
- `backend/scripts/v219-preinstall-ci-gate.cjs` va unga bog‘liq CI identifikator tekshiruvlari.
- `backend/package.json` va tegishli v213–v219 testlari.
- `AGENTS.md`dagi xavfsizlik va migratsiya talablar.

## Muammo
v219 GitHub Actions commit SHA bilan `git HEAD` bir xilligini tekshiradi, ammo
Git ishchi katalogida commitdan keyin tahrirlangan, staged yoki untracked kod
borligini alohida tekshirmaydi. Shuning uchun `HEAD` to‘g‘ri ko‘rinsa ham,
CI testlari boshqa kod bilan ishlashi mumkin edi.

## O‘zgarish
- `backend/scripts/v220-checked-source-tree-gate.cjs` yaratildi.
- CI konteksti va HEAD tasdiqlangandan keyin `git status --porcelain=v1
  --untracked-files=all` bilan `.github/`, butun `backend/`, root `.gitignore`,
  `.gitattributes`, `.gitmodules` va `.npmrc` tekshiriladi.
- Har qanday status natijasi yoki git xatosi testni to‘xtatadi. Fayl nomlari,
  commit SHA, test ma'lumotlari va env qiymatlari logga yozilmaydi.
- GitHub Actions tekshiruvni `npm ci`dan oldin va test bazasini yaratishdan
  oldin qayta bajaradi.
- `backend/package.json`ga `test:v220:unit` qo‘shildi.
- `backend/test/v220CheckedSourceTree.unit.test.js`da 11 ta offline test.

## Lokal tekshiruvlar (2026-11-21)
- v213: 182/182, v214: 12/12, v215: 9/9, v216: 11/11
- v217: 11/11, v218: 9/9, v219: 8/8, v220: 11/11
- Jami: **253/253 unit-test muvaffaqiyatli**.
- JavaScript sintaksisi va workflow YAML sintaksisi tekshirildi.
- Git muhitining haqiqiy vaqtinchalik repozitoriysida staged, unstaged va
  untracked fayllar hamda toza checkout holati sinab ko‘rildi.

## Nima hali tekshirilmagan
- PostgreSQL 18 bilan real integratsiya yoki yozuvchi concurrency testi
  bajarilmadi; bu muhitda `postgres`, `psql` yoki Docker mavjud emas.
- GitHub Actions ishga tushirilmadi va GitHub repozitoriysiga hech narsa
  yuborilmadi.
- Bu tekshiruv Git tomonidan e'tiborga olinmaydigan (`.gitignore`)
  fayllarni tekshirmaydi va tekshiruvdan keyin sodir bo‘ladigan o‘zgarishlardan
  kriptografik himoya bermaydi.
- `npm ci` va haqiqiy GitHub Actions muhitidagi workflow ishlashi tasdiqlanmagan.

## Keyingi talab
Yangi workflow GitHub’da commit qilingach, ajratilgan PostgreSQL test xizmatida
manual integratsiya sinovi bajarilishi va uning loglari tahlil qilinishi zarur.
GitHub’ga yozish va migratsiya/SQL amallariga ruxsat bu bosqichda olinmagan;
hech qanday production bazaga ulanilmadi.
