# USTARA v81 — test runbook

### Talablar
- Node >= 22 (lokal unit testlar uchun PostgreSQL shart emas).
- Real DB sinovi uchun oldindan tasdiqlangan **faqat test** PostgreSQL baza va barcha 42 forward migratsiya; hech qachon production URL ishlatmang.
- DB test rol/URL va flaglarni ishlab chiqarish muhitiga ulash mumkin emas. Test skriptidagi `testTarget` va rol/DB xavfsizlik tekshiruvlari saqlanadi.

### Unit
```bash
cd USTARA-New/frontend
npm run test:unit
# Kutilgan v81: 290/290 PASS (Node unit, Vite build emas)
cd ../backend
npm run test:v81:unit
# Kutilgan: tanlangan testlar PASS; to‘liq backend uchun paketlarni npm ci bilan o‘rnatish talab etiladi
```

### PostgreSQL (faqat test muhitida)
```bash
cd USTARA-New/backend
npm ci
export NODE_ENV=test
export USTARA_BOOKING_CONCURRENCY_TESTS=I_AUTHORIZE_TEST_DATA
export USTARA_TEST_DATABASE_URL='postgresql://ustara_account_test:...@127.0.0.1:5432/ustara_test_db'
npm run test:v81:db
```
Baza va ma'lumotlar boshqa testlar bilan bir vaqtda ishlatilmasin; haqiqiy maxfiy URL hech qachon GitHub/ZIP/loglarga kiritilmasin. Yangi v81 test: bitta mijozning UUID key orqali existing booking topilishi, qayta POST replay bo‘lishi va boshqa mijozga ko‘rinmasligi.

### Manual HTTP/browser
1. Mijoz nomidan POST booking yuboring. POST muvaffaqiyatli commit bo‘lib, HTTP response yo‘qolgandek test qiling (faqat stagingda).
2. Same `request_id` bilan GET recovery; qaytgan bronning egasi, narxi va xizmat snapshotini tekshiring.
3. Boshqa customer bilan GET `found:false` va no booking leak; unauthorized 401.
4. Birinchi POST hali tugamaganida GET `found:false` bo‘lishi mumkin; UI boshqa slotni avtomatik yubormasligini sinang.
5. Logoutdan so‘ng eski UUID saqlanmaganini, yangi akkaunt bu UUID ni ishlatmasligini tekshiring.

**Ushbu qadamlar hali real bazada/brauzerda bajarilmadi.**
