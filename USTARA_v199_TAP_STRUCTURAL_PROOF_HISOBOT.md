# USTARA v199 — TAP structure fail-closed verification

## Maqsad
v198 ning read-only PostgreSQL runtime permission proof tizimini saqlagan holda, v195–v197 integration evidence zanjirida faqat yakuniy TAP statistikalariga ishonish zaifligini kamaytirish.

## O'zgarishlar
- `backend/scripts/v195-tap-result-gate.cjs` TAP v13 header bir martagina kelganini, bir dona `1..1` top-level plan borligini, kutilgan yagona top-level suite nomini va nested test plan mavjudligini tekshiradi.
- TAP ichidagi istalgan `not ok` assertion hamda `# SKIP` / `# TODO` belgilari muvaffaqiyatli statistikaga qaramasdan rad etiladi.
- `backend/test/v199TapStructuralProof.unit.test.js` da 6 ta regression-test qo'shildi.
- v195/v196/v197 sintetik TAP fixture'lari nested plan bilan yangilandi; v198 workflow tekshiruvi v199 unit targetga moslashtirildi.
- `backend/package.json` ga `test:v199:unit` qo'shildi, qo'lda ishga tushiriladigan `.github/workflows/v193-isolated-postgres-booking.yml` unit test bosqichida shu targetni chaqiradi.

## Tekshirish
`cd backend && npm run test:v199:unit`

Mahalliy Node.js test natijasi: **42 passed, 0 failed**.

## Cheklovlar
- Ushbu 42 ta test offline/unit darajasida; haqiqiy PostgreSQL integratsiya testi emas.
- Haqiqiy disposable PostgreSQL va GitHub Actions ishga tushirilmagan; release/prod tayyorligi tasdiqlanmagan.
- TAP parser Node.js `--test-reporter=tap` va aynan bitta v14 suite uchun mo'ljallangan; generic TAP parser emas.
- `LOYIHA TUGADI` statusi berilmaydi.
