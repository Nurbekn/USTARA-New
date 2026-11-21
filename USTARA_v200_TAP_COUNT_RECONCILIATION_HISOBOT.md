# USTARA v200 — TAP nested count reconciliation

## Maqsad
v199 TAP strukturasi tekshiruvini kuchaytirib, ichki assertionlar soni, ularning tartib raqamlari, nested plan va umumiy TAP `tests/pass` hisoblari o'zaro mos kelishini majburiy qilish.

## O'zgarishlar
- `backend/scripts/v195-tap-result-gate.cjs`: aynan bir nested `1..N` reja; `N` ta ichki `ok` assertion; tartib raqamlari `1..N`; umumiy testlar `N+1` bo'lishi tekshiriladi.
- `backend/test/v200TapCountReconciliation.unit.test.js`: yangi 7 ta offline regression-test.
- `backend/package.json`: `test:v200:unit` komandasi.
- `.github/workflows/v193-isolated-postgres-booking.yml`: CI offline targeti v200 ga yangilandi.
- `backend/test/v198PostgresRuntimeProof.unit.test.js`: workflow kutilmasi yangilandi.

## Tekshirish
`cd backend && npm run test:v200:unit` — **49 passed, 0 failed**.

## Cheklovlar
- Ushbu 49 ta test offline unit-testlar. Haqiqiy PostgreSQL 18 bilan integratsiya sinovi yoki GitHub Actions run o'tkazilmadi.
- Tekshiruvchi aynan ushbu bitta top-level subtestli Node TAP formatiga mo'ljallangan. Boshqa reporter yoki test arxitekturasida qayta ko'rib chiqish kerak.
- TAP dagi summary va body mosligi ma'lumotning kriptografik kelib chiqishini isbotlamaydi; SHA-256 faqat fayl yaxlitligini belgilaydi.
- Production tayyorligi tasdiqlanmagan; `LOYIHA TUGADI` statusi berilmaydi.
