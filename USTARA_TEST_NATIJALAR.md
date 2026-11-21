# USTARA — ushbu ZIP test natijalari

- Node.js backend `node --test test/bookings.unit.test.js test/bookingSelection.unit.test.js`: **27/27 PASS**.
- Node.js Telegram `node --test test/telegramMenu.unit.test.js test/telegram.unit.test.js test/phoneChange.unit.test.js test/telegramOtp.unit.test.js`: **30/30 PASS**.
- Keyingi backend smoke `node --test test/bookings.unit.test.js test/telegramMenu.unit.test.js test/telegram.unit.test.js`: **37/37 PASS**.
- Frontend `node node_modules/vite/bin/vite.js build`: **PASS**, Vite tayyor JS/CSS yaratdi. ZIPdagi deps fayllari execution permission bermagani uchun `npm run build` dastlab `vite: Permission denied` dedi; yuqoridagi node bilan bevosita build o‘tdi. Normal `npm ci` bu permissionni to‘g‘rilashi kerak.

**Bajarilmagan sinovlar:** real PostgreSQL migration, foydalanuvchi ma’lumotlari bilan E2E, parallel mustaqil DB connection contention, haqiqiy Telegram Bot API, deployment, barcha 185 qaror bo‘yicha to‘liq E2E. Bularni bajarilgan deb hisoblamang.

**Maxfiylik:** `.env`, bot tokeni, DB paroli, `node_modules`, build natijalari va `.git` yangilangan arxivga kiritilmadi.
