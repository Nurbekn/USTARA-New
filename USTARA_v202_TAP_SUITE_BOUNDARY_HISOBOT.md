# USTARA v202 — TAP suite boundary integrity

## Asos
v201 TAP footer integrity va v200 assertion reconciliation.

## O‘zgarishlar
- `backend/scripts/v195-tap-result-gate.cjs`: aynan bitta kutilgan `# Subtest:` sarlavhasi; boshqa yashirin yoki takroriy subtest bo‘lsa, rad etiladi.
- Nested assertionlar faqat subtest sarlavhasi va nested plan orasida turishi shart. Boshqa joyga ko‘chirilgan assertions rad etiladi.
- Global `# suites 0` qiymati tekshiriladi; boshqa qiymat bilan soxta TAP report qabul qilinmaydi.
- `backend/test/v202TapSuiteBoundary.unit.test.js`: 8 ta yangi regressiya testi.
- GitHub Actions manual PostgreSQL workflow offline testlarni `test:v202:unit` orqali bajaradi.

## Cheklovlar
Ushbu unit-testlar haqiqiy PostgreSQL integratsiya sinovini tasdiqlamaydi. GitHub Actions workflow lokal muhitda ishga tushirilmagan.
