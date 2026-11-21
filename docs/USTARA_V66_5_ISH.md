# USTARA v66 — 5 ish: CI test bazasi va frontend bog‘langan resurslari

**Asos:** v65 `USTARA-4-Bosqich-Transitive-Asset-Chrome-v65.zip` (794 fayl). **Yangi:** `USTARA-4-Bosqich-CI-DB-Bundle-Readiness-v66.zip`. Real GitHub Actions yoqilmagan. **Production-ready emas.**

1. **Compiled JS chunk audit:** `scripts/js-chunk-check.cjs` Vite `assets/*.js` fayllarining statik/dinamik ESM importlari, qayta eksportlari va `new URL(...,import.meta.url)` bilan ishlatiladigan lokal resurslarni tekshiradi. Mavjud bo‘lmagan, bo‘sh, symlink yoki root’dan tashqariga chiqadigan chunk rad etiladi. Statik analiz; brauzerning barcha runtime so‘rovlari kafolatlanmaydi.
2. **PWA webmanifest resurslari:** `scripts/webmanifest-check.cjs` HTML’dagi lokal manifest JSON, `icons`, `screenshots` va `shortcuts[].icons` fayllarini cheklangan hajmda, faqat Pages ostidagi lokal fayllar sifatida tekshiradi. Buzilgan JSON, uzoq URL, traversal va yo‘qolgan ikonka rad etiladi.
3. **CI xavfsiz preflight:** `backend/scripts/v66-ci-preflight.js` paket o‘rnatilishidan oldin `NODE_ENV=test`, ruxsatli GitHub event, mahalliy `ustara_test_db`/`ustara_account_test` PostgreSQL URL, beshta staging roziligi hamda public HTTPS API konfiguratsiyasini tekshiradi. Tarmoqqa ulanmaydi, parollarni chiqarmaydi.
4. **Read-only DB readiness:** `backend/scripts/v66-db-readiness.js` haqiqiy CI’da migratsiyalardan so‘ng `BEGIN READ ONLY` tranzaksiyasida bazaning egasini, 42 ta versiya, `btree_gist`, kerakli jadvallar va superuser bo‘lmagan, huquqi mavjud `ustara_login_test` rolini tekshiradi. O‘zgarish kiritmaydi, xatoda ROLLBACK qiladi. Bu muhitda test DB mavjud emas, **NOT_RUN**.
5. **CI mosligi va regressiya:** workflow preflight’ni `npm ci`dan oldin, DB-readiness’ni login roli va migratsiyadan keyin, barcha integratsiya testlaridan oldin bajaradi. `v66IntegrationReadiness.unit.test.js` 12 ta yangi test va `npm run test:v66:unit` qo‘shildi. `verifyPagesOutput` CI va Pages uchun bir xil kuchaytirilgan JS/manifest tekshiruvini qo‘llaydi.

## Natijalar (2026-11-19)
- **99/99 selected backend PASS**, **528 PASS / 26 FAIL** to‘liq backend. 26 xato yetishmayotgan `express`, `bcrypt`, `jsonwebtoken`, `pg` npm paketlaridan, full suite PASS **emas**.
- **178/178 frontend PASS**, **12/12 v66 yangi test PASS**.
- Offline **185 qaror, 42 forward migratsiya PASS**, asl CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` o‘zgarmagan. Bu 185 funksiyaning yakunlangani degani emas.
- PostgreSQL integratsiya: **1 SKIP**, haqiqiy DB preflight **NOT_RUN**, GitHub Actions **NOT_RUN**, Vite `vite: not found` **BLOCKED**, real Chrome production E2E/Telegram **NOT_RUN**.
- **v66 production-ready EMAS**.
