# USTARA v192 — Dependency va integratsiya tayyorligi hisoboti

## Maqsad

v191 dagi `1779/1808` backend unit-test natijasidagi 29 ta xatoni uydirma mocklar yordamida yopmasdan, asl sababni ko‘rsatish va ishonchli CI tekshiruvini tayyorlash.

## Tekshirilgan manbalar

- v191 arxividagi `backend/package.json`, `backend/package-lock.json`, `frontend/package.json`, `frontend/package-lock.json`.
- `backend/telegram/customerBookingNotificationWorkerV191.js` va unga tegishli unit-testlar.
- Mavjud `backend/database/bootstrap.sql` va SQL bootstrap testlari.
- Oldingi 185 qaror reyestri va migratsiyalar faqat saqlandi; o‘zgartirilmadi.

## v192 dagi o‘zgarishlar

1. `backend/scripts/v192-dependency-readiness.cjs` — *offline* paket mavjudligi va lockfile mosligini tekshiradi. `backend`, `frontend`, `all` rejimlari bor. Paket yetishmasa **BLOCKED** natija va nonzero exit kodi beradi; testlar o‘tdi deb noto‘g‘ri xulosa chiqarmaydi. `.env` fayllari o‘qilmaydi.
2. `backend/test/v192DependencyReadiness.unit.test.js` — mavjud paketlar, yo‘q paketlar, nomuvofiq lockfile, manba xavfsizligi va CI tuzilishini tekshiruvchi 5 ta unit-test.
3. `.github/workflows/v192-verified-dependencies.yml` — GitHub Actions uchun **faqat** `workflow_dispatch` yoki `main`/`develop` ga PR yuborilganda ishga tushadigan xavfsiz quality gate. Node 22 da backend va frontend uchun alohida `npm ci`, dependency gate, to‘liq unit-testlar va frontend production build bajariladi. Workflow hech qanday maxfiy secret, DB migratsiyasi yoki Telegram API’dan foydalanmaydi.
4. `backend/package.json` — `npm run v192:deps` va `npm run test:v192:unit` buyruqlari qo‘shildi. Lockfile’dagi dependency versiyalari o‘zgartirilmagan.

## Shu muhitda haqiqatan bajarilgan testlar

| Tekshiruv | Natija | Izoh |
|---|---:|---|
| Barcha frontend unit-testlar | **1739/1739 PASS** | Offline Node testlar |
| Barcha backend unit-testlar | **1784/1813 PASS**, 29 FAIL | 11 `express`, 9 `jsonwebtoken`, 6 `bcrypt`, 3 `pg` moduli topilmadi |
| v192 va v191 ga oid maqsadli unit-testlar | **19/19 PASS** | PostgreSQL/Telegram so‘rovi bajarilmagan |
| SQL bootstrap unit-testlari | **13/13 PASS** | Faqat offline mock/statik tekshiruv |
| `node --check` (yangi JS) | **PASS** | Sintaksis |
| Dependency readiness | **BLOCKED** | Lokal backend va frontend paketlari to‘liq o‘rnatilmagan |
| Backend `npm ci --offline` | **FAILED** | `xtend@4.0.2` tarball lokal keshlanmagan |
| Npm registry DNS | **UNAVAILABLE** | `registry.npmjs.org` hosti bu muhitda aniqlanmadi |
| Production frontend build | **NOT RUN** | `vite` lokal o‘rnatilmagan |
| PostgreSQL va Telegram E2E | **NOT RUN** | Real ulanishlar va yozishlar uchun alohida tasdiqlangan test muhit talab etiladi |
| GitHub Actions real run | **NOT RUN** | Workflow faqat repozitoriyga joylangach foydalanuvchi tomonidan ishga tushiriladi |

**29 ta fail**ni dasturiy xato yo‘q deb talqin qilmaslik kerak: ularni haqiqiy paketlar o‘rnatilgan muhitda qayta bajarish shart. Shu yerda qo‘shimcha regressiya yashirin bo‘lishi mumkin.

## Tekshirish yo‘li

Repo root katalogidan offline statusni ko‘rish:

```bash
node backend/scripts/v192-dependency-readiness.cjs all
```

Internet va ishonchli npm registriga ulanish bo‘lganda:

```bash
cd backend
npm ci --no-audit --no-fund
npm run v192:deps
npm run test:unit
cd ../frontend
npm ci --no-audit --no-fund
npm run test:unit
npm run preflight:graph
npm run build
```

CI uchun `.github/workflows/v192-verified-dependencies.yml` faylini GitHub repozitoriyga commit qiling. GitHub Actions orqali workflow’ni **qo‘lda** ishga tushirish yoki `main`/`develop` ga pull request ochish mumkin. Workflow `DATABASE_URL` va Telegram tokeni bilan ishlamaydi.

## Real integratsiyaga ruxsat chegarasi

- **PostgreSQL:** alohida, izolyatsiyalangan `ustara_test_db` yoki staging baza, tegishli test ruxsati, backup va DB target identity guard tasdiqlanmaguncha migratsiya/yozuvchi test ishga tushirilmaydi. 63 forward + 2 rollback fayli saqlangan, ammo runtime tekshiruvi bajarilmagan.
- **Telegram:** avval mock API va staging bot/chat bilan tekshirish; haqiqiy foydalanuvchilarga xabar yubormaslik. `ENABLE_CUSTOMER_BOOKING_NOTICE_WORKER` o‘z-o‘zidan yoqilmaydi; natija noma’lum qolsa qayta yuborilmaydi.
- **Production:** to‘liq backend suite, frontend build, booking parallelizm sinovi, rollback/recovery, OTP va Telegram E2E tekshiruvi, xavfsizlik monitoringi o‘tmaguncha production-ready deyilmaydi.

## Xulosa

v192 lokal muhitdagi paket muammosini **bartaraf etmadi**, balki uni qayta ishlab ko‘riladigan, yashirmaydigan quality gate bilan boshqariladigan holatga keltirdi. Asl ish kodini soxta shimlar bilan o‘zgartirmadik. **LOYIHA TUGADI emas** — real kutubxonali CI va integratsiya isboti hali zarur.
