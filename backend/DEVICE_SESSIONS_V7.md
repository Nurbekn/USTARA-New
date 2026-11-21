# USTARA v7 — #84 qurilma sessiyalari

## Amaliy imkoniyatlar

- Customer va Barber login hamda registration JWT `sid` bilan imzolanadi; `account_device_sessions` da shu sessiyaning server tomondagi holati saqlanadi. Token yoki IP manzili DB ga yozilmaydi.
- `GET /api/auth/sessions/devices` — faqat o‘z faol sessiyalari (20 tagacha). `POST /api/auth/sessions/devices/:id/revoke` — faqat o‘zi tegishli, faol sessiyani o‘chirish. `POST /api/auth/sessions/revoke-all` — avvalgi sessionVersion mexanizmi orqali hammasini bekor qiladi.
- JWT dagi `sid` tegishli user va faol sessiyaga mos bo‘lmasa auth rad etiladi. `sid` siz oldingi JWT’lar eski expiry muddatigacha qabul qilinadi. **Alohida logout faqat v7 dan keyingi sessiyalarni qamrab oladi.**

## Xavfsiz o‘rnatish

1. Avval real bazani emas, ruxsat etilgan izolyatsiyalangan test bazasini tanlang. Zaxira va database identifikatorini operator tekshirsin.
2. `20261127_manual_account_recovery.sql` dan keyin `20261128_device_sessions.sql` migration qo‘llanadi. U qo‘llanmasdan v7 login ishga tushsa, fail closed bo‘ladi (loginni tasdiqlamaydi). Qayta qo‘llash avtomatik emas.
3. Faqat migratsiya va real testlar muvaffaqiyatli bo‘lgach deployment. Boshqa eski migratsiyalarni qayta ishga tushirmang.
4. Test uchun: `cd backend && node --test test/deviceSessions.unit.test.js test/audit-phase1.unit.test.js test/bootstrap-plan.unit.test.js`.

## Hali bajarilmagan

- Real PostgreSQL sinovi, browser E2E, haqiqiy Telegram va login + session lifecycle testlari.
- Eski tokenlardan ketma-ket migratsiya (eski sid’siz tokenlar o‘zining 7 kunlik amal qilish muddati oxirigacha version check bilan yashaydi).
- Barcha 185 qarorni yakunlash hali davom etadi.
