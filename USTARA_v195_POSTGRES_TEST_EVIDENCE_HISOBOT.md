# USTARA v195 — PostgreSQL concurrency TAP natijasi uchun fail-closed gate

## Yangilanish

- `backend/scripts/v195-tap-result-gate.cjs` qo'shildi. Node.js TAP hisobotida aynan booking concurrency testi bajarilganini, ichki subtestlar borligini, testlar soni 2 tadan kam emasligini hamda **pass = tests**, `fail = skipped = cancelled = todo = 0` ekanini tekshiradi.
- V193 nomli **faqat qo'lda yoqiladigan** PostgreSQL CI workflow v194 read-only bootstrap proof'dan keyin `set -euo pipefail` bilan `node --test --test-reporter=tap ... | node scripts/v195-tap-result-gate.cjs` ishlatadi. Pipeline node test xatosini ham, v195 natija xatosini ham yashirmaydi.
- `npm run test:v195:unit` yordamida 20 ta v193-v195 gate unit testi tekshirildi: **20/20 PASS**.

## Nimaga kerak

Node test runner barcha testlar `skip` bo'lsa ham ayrim vaziyatlarda exit code 0 qaytarishi mumkin. Shuning uchun oddiy yashil CI natijasi concurrency sinovi haqiqatan bajarilganini isbotlamaydi. v195 TAP hisobotidagi aniq test nomini va barcha yakuniy hisoblarni tekshirishni talab qiladi.

## Chegaralar

Haqiqiy PostgreSQL va to'liq backend paketlari ushbu muhitda ishga tushirilmadi. Real SQL bootstrap, v194 jonli catalog proof, concurrency integration, Telegram staging, production deploy va rollback mashqi **NOT RUN**. v195 ular o'tdi deb da'vo qilmaydi. Migration va ilova ma'lumotlari o'zgartirilmadi. CI workflow hali ham faqat `workflow_dispatch` orqali ishga tushadi.

**LOYIHA TUGADI** emas: production tayyorligi uchun real disposable PostgreSQL sinovlari va qolgan staging tekshiruvlari kerak.
