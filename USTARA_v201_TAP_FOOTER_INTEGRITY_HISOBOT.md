# USTARA v201 — TAP footer integrity

## Asos
USTARA v200 TAP assertion count reconciliation.

## O'zgarishlar
- `backend/scripts/v195-tap-result-gate.cjs` validator yakuniy TAP summary footer (`tests`, `suites`, `pass`, `fail`, `cancelled`, `skipped`, `todo`, `duration_ms`) tartibini tekshiradi.
- `TAP version 13` stream boshida bo'lishi kerak; summarydan keyin ortiqcha satr bo'lmasligi kerak.
- Top-level `1..1` va required suite muvaffaqiyati summarydan bevosita oldin bo'lishi shart.
- Nested plan top-level completiondan oldin bo'lishi shart.
- `backend/test/v201TapFooterIntegrity.unit.test.js` 9 ta yangi regression-test bilan tekshiradi.
- Opt-in `.github/workflows/v193-isolated-postgres-booking.yml` offline v201 unit-testlarni CI da ishga tushirishga yangilandi.

## Sinov
`cd backend && npm run test:v201:unit` — 58/58 o'tdi (lokal Node.js v22.16.0).

## Cheklovlar
Real PostgreSQL bootstrap/integration workflow bu muhitda ishga tushirilmagan.
Mavjud loyihaning barcha frontend/backend testlari to'liq o'tkazilmagan; production-ready deyish mumkin emas.
