# USTARA v203 — haqiqiy Node TAP formati va integratsiya sinovlari qamrovi

## Tekshirilgan asos
- v202 arxividagi `backend/scripts/v195-tap-result-gate.cjs` va `backend/scripts/v196-integration-evidence.cjs`.
- `backend/test/bookingConcurrency.postgres.integration.test.js`: 12 ta `await t.test(...)` sinovi.
- Manual GitHub Actions workflow va unga bog'liq v195–v202 unit-testlar.

## Aniqlangan muammo
Node.js 22 `--test --test-reporter=tap` haqiqiy ichki sinovlarning har biri uchun `    # Subtest:` sarlavhasi va assertiondan keyin YAML ko'rinishidagi diagnostika blokini chiqaradi. v202 parseri esa bunday sarlavhalarni ortiqcha deb, diagnostika blokini esa noto'g'ri joylashgan deb rad etishi mumkin edi. Bu holat offline unit-testlarda yashirin qolgan edi, chunki ularning TAP namunalari soddalashtirilgan edi.

## v203 o'zgarishlari
1. v195 TAP validatori haqiqiy Node.js diagnostika bloklarini, ichki `# Subtest:` sarlavhalarini va asosiy suite diagnostikasini to'g'ri tushunadigan qilindi.
2. Ichki sarlavhalar va assertion nomlari qat'iy juftlashtiriladi. Aralash, takrorlangan, noto'g'ri joylashgan yoki to'liq bo'lmagan sintaksis rad etiladi.
3. `backend/scripts/v203-integration-case-coverage.cjs` qo'shildi. U real integratsiya test faylidan oldindan auditlangan 12 ta sinov nomining to'liq, aniq tartibda bajarilganini tekshiradi. Faqat yakuniy `tests/pass` sonlari yetarli emas.
4. v196 dalil yaratuvchisining CI kirish nuqtasi `requireCaseCoverage: true` orqali mazkur tekshiruvni majburiy qo'llaydi; tekshiruv muvaffaqiyatli o'tmaguncha JSON dalil fayli yozilmaydi. Avvalgi versiyalarning soddalashtirilgan unit-test namunalari uchun lokal `buildEvidence` chaqiruvlari o'z holicha ishlaydi.
5. GitHub Actions workflow v203 offline testlarni bajaradi.
6. 14 ta yangi regression-test qo'shildi, mavjud workflow bilan bog'liq bitta test moslashtirildi.

## Amalda bajarilgan sinovlar
- `cd backend && npm run test:v203:unit` — **80 ta test / 80 ta muvaffaqiyatli / 0 ta muvaffaqiyatsiz**.
- Unit-test ichida Node.js 22 ning haqiqiy `--test --test-reporter=tap` jarayoni alohida ishga tushirilib, format validator va majburiy 12 ta nom bilan sinab ko'rildi. Bu jarayondagi sinovlar real PostgreSQLga ulanmagan; TAP formatni tekshirish uchungina mo'ljallangan.
- O'zgargan JavaScript fayllari `node --check` bilan tekshirildi — **muvaffaqiyatli**. GitHub Actions YAML fayli sintaktik parse tekshiruvidan o'tdi.

## Qolgan cheklovlar
- Haqiqiy PostgreSQL service/migratsiya/integratsiya sinovlari **bajarilmadi**; GitHub Actions ishga tushirilmagan.
- Test nomlari qamrovi sinov natijasini va CI oqimini qat'iy tekshiradi, lekin PostgreSQL tranzaksiyalarining amalda ishlashini o'zi isbotlamaydi.
- 12 ta ichki integratsiya testidan biri o'zgarsa, v203 audit ro'yxatini ongli ravishda yangilash va testlardan o'tkazish lozim.
- Production tayyorligi tasdiqlanmagan. Real ma'lumotlar bazasi yoki migratsiyalarga tegilmadi.
