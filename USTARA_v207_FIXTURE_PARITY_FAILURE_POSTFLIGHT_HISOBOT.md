# USTARA v207 — Fixture Parity & Failure Postflight

Sana: 2026-11-21

## Ko'rib chiqilgan
- `.github/workflows/v193-isolated-postgres-booking.yml`
- `backend/scripts/v205-empty-fixtures-proof.cjs`
- `backend/scripts/v206-postrun-cleanup-proof.cjs`
- `backend/test/v205EmptyFixturesProof.unit.test.js`
- `backend/test/v206PostrunCleanupProof.unit.test.js`
- Ular bilan bog'liq v193–v206 offline regression testlari.

## Aniqlangan muammo
v206 bosqichida concurrency sinovidan avvalgi read-only tekshiruv 12 ta jadvalni, sinov tugagach esa 14 tasini tekshirgan. Natijada `booking_request_keys` va `customer_telegram_link_tokens` da oldindan mavjud yozuvlar preflightdan o'tib ketishi mumkin edi. Bundan tashqari, integratsiya testi xato bilan tugasa, GitHub Actions sukut bo'yicha postflightni o'tkazib yuborardi.

## Kiritilgan o'zgarishlar
1. v205 preflight jadval ro'yxatiga `booking_request_keys` va `customer_telegram_link_tokens` qo'shildi: jami 14 ta.
2. v206 postflight ro'yxati v205 dagi yagona ro'yxatdan shakllanadi. Ikkala bosqichda bir xil fixture inventory.
3. CI concurrency bosqichiga `id: booking_integration` qo'shildi. `postflight` sinovi muvaffaqiyatli yoki muvaffaqiyatsiz tugasa ham ishlaydi, ammo job bekor qilinsa yoki test bosqichi umuman o'tkazib yuborilsa ishlamaydi.
4. Yakuniy evidence verification va upload faqat barcha kerakli bosqichlar muvaffaqiyatli o'tganida amalga oshadi. `continue-on-error` qo'shilmadi.
5. `test:v207:unit` qo'shildi, avvalgi testlar yangi CI versiyasiga moslashtirildi va 10 ta yangi regression-test yaratildi.

## Haqiqatan bajarilgan tekshiruvlar
- `npm run test:v207:unit`: **120/120 PASS**, fail=0, skipped=0.
- `node --check` (tegishli 3 ta fayl): PASS.
- YAML parsing va workflow tarkibi (Python/PyYAML): PASS, 15 qadam, manual-only trigger, postflight sharti va success-only upload tekshirildi.
- ZIP faylning CRC/yaxlitligi yakuniy arxivlashda tekshiriladi.

## Hali tasdiqlanmagan
- Real PostgreSQL 18 server, `psql` va Docker bu ish muhiti ichida mavjud emas.
- GitHub Actions ishga tushirilmadi. Real PostgreSQL bootstrap, concurrency integratsiya sinovi va production holati **tasdiqlanmagan**.
- Hech qanday foydalanuvchi bazasi, ma'lumotlari yoki tarixiy migratsiya o'zgartirilmadi.

## Navbatdagi amaliy ish
Yangilangan manbani GitHub reposiga joylab, `USTARA v193 - opt-in isolated PostgreSQL booking concurrency` workflow'ini **faqat qo'lda** `Run workflow` orqali ishga tushirish. Tekshirish kerak: PostgreSQL 18 bootstrap, preflight 14/14, booking concurrency 12 ta ichki case, postflight 14/14 va yakuniy evidence artifact. Bu test ishlab chiqarish ma'lumotlar bazasiga ulanmasligi shart.
