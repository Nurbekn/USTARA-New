# USTARA v214 — CI evidence yozish xavfsizligi va eski TAP log himoyasi

**Boshlang‘ich manba:** `USTARA-v213-Commit-Bound-Postgres-CI-Evidence.zip`.
**Holat:** Lokal/offline unit-testlardan o‘tgan; haqiqiy PostgreSQL 18 integratsiya testi bu muhitda bajarilmadi.

## Asosiy muammolar

1. v212 tekshiruvchisi (verifier) dalil faylini descriptor orqali o‘qiydi, biroq v213 yozuvchisi (writer) faqat katalog nomini tekshirgach faylni yana nomi orqali ochgan. Ikki amal orasida `artifacts` katalogi almashtirilsa, yozuv yo‘nalishi o‘zgarishi yoki muvaffaqiyat holati noto‘g‘ri qayd etilishi mumkin.
2. Eski `backend/scripts/v195-tap-result-gate.cjs` CLI hali ham TAP satrlarini stdout’ga chiqargan. U real PostgreSQL workflow’da to‘g‘ridan-to‘g‘ri ishlatilmasa-da, qo‘lda chaqirilsa TAP ichidagi maxfiy matnlarni CI logiga tushirishi mumkin edi.

## v214 tuzatishlari

- `backend/scripts/v214-anchored-evidence-write.cjs` yangi yozuvchi: Linux’da `O_DIRECTORY`, `O_NOFOLLOW`, `O_EXCL` va `/proc/self/fd/<directoryFd>/<file>` orqali ochilgan katalog inode’iga bog‘lanadi.
- Yozishdan oldin katalog nomi ochilgan descriptor bilan mosligi tekshiriladi. Yozishdan so‘ng ham katalog va fayl inode’lari, hajm, hardlink holati tekshiriladi.
- 4 KiB’dan katta yoki juda kichik dalil yozilmaydi. Fayl `0600` huquqi bilan yaratiladi; mavjud fayl ustidan yozilmaydi.
- Eski v195 CLI xom TAP ni logga chop etmaydi; faqat PASS/FAIL xulosasi chiqariladi.
- GitHub Actions’ning faqat qo‘lda (`workflow_dispatch`) ishga tushadigan mavjud oqimiga `test:v214:unit` qo‘shildi. Oldingi `test:v213:unit` saqlandi va ikkisi ham SQL ishlashidan oldin bajariladi.
- Vaqt bo‘yicha poyga (directory swap, symlink swap), mavjud fayl, noto‘g‘ri yo‘l, sig‘im va xom log chiqishiga oid 12 ta offline test qo‘shildi.

## O‘zgargan fayllar

1. `backend/scripts/v214-anchored-evidence-write.cjs` — yangi.
2. `backend/scripts/v196-integration-evidence.cjs` — yangi descriptor asosidagi yozuvchini ishlatadi.
3. `backend/scripts/v195-tap-result-gate.cjs` — xom TAP chiqishini logga yozmaydi.
4. `backend/test/v214AnchoredEvidenceWriter.unit.test.js` — 12 ta regression-test.
5. `backend/package.json` — `test:v214:unit` komandasi.
6. `.github/workflows/v193-isolated-postgres-booking.yml` — eski unit-testlar va yangi regression-testlar SQL’dan oldin.
7. Ushbu hisobot.

## Tasdiqlangan tekshiruvlar

- `cd backend && npm run test:v213:unit` — **182/182 PASS**.
- `cd backend && npm run test:v214:unit` — **12/12 PASS**.
- **Jami: 194/194 lokal unit-test.** Bu PostgreSQL bilan real integratsiya testi degani emas.
- JavaScript sintaksisi, workflow YAML parse va ZIP yaxlitligi alohida tekshirildi.

## Hali bajarilmaganlar va keyingi qadam

- Muhitda `postgres`, `psql`, `docker` hamda o‘rnatilgan server topilmadi, shuning uchun real `postgres:18-alpine` testi o‘tkazilmadi.
- GitHub repozitoriysiga **hech narsa yuborilmadi**. Real tekshiruv uchun yangilangan kodni repozitoriyga joylab, `.github/workflows/v193-isolated-postgres-booking.yml` workflow’ini GitHub Actions orqali **qo‘lda** ishga tushirish kerak. Haqiqiy bootstrap, 12 ta booking concurrency holati va postflight natijalarini GitHub log/artifact’dan tasdiqlash kerak.
- Yozuvdagi TOCTOU xavflarini kamaytirish himoyasi barcha dushmanona local filesystem holatlarini mutlaq hal qiladi degani emas; CI uchun alohida, ishonchli runner talab qilinadi.

**Production holati: tasdiqlanmagan. LOYIHA TUGADI deb yozilmaydi.**
