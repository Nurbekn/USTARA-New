# USTARA v183 — #134 Privacy Center: birinchi ma’lumot eksporti

## Nima qo‘shildi

- `GET /api/privacy/export` — customer yoki barber JWT sessiyasi va bazada tekshirilgan account/profile identifikatori bilan.
- Tranzaksiya `REPEATABLE READ READ ONLY` holatida profil va bron metadata-sini bir snapshotda o‘qiydi; begona mijoz ismi, telefoni, xabarlari va sartaroshning maxfiy bron qaydlari SELECT qilinmaydi.
- Ruxsatli maydonlar qat’iy ro‘yxatda: o‘z telefon raqami, o‘z profili, o‘z bronlarining vaqt/status/xizmat identifikatori va davomiyligi. Boshqa tomon account/profile ID-si ham eksportda berilmaydi.
- 5000 ta bron chegarasi: ko‘proq bo‘lsa to‘liqsiz eksportni “to‘liq” deb bermaydi; `413` qaytaradi.
- Xatolik, ruxsatsiz kirish yoki noto‘g‘ri profil ID holatlarida fail-closed; response `Cache-Control: no-store`. Export endpoint serverda fayl saqlamaydi.
- Mijoz/sartarosh Profil sahifalarida 3 tilli Download UI. Client JSON faylni faqat tugma bosilganda generatsiya qiladi. Sessiya almashsa so‘rov bekor bo‘ladi va eski account ma’lumoti yuklab olinmaydi.

## Qamrov va chegaralar

Bu **to‘liq Privacy Center emas**: chat, media, sharh, baholar, oshkor qilish roziliklari, to‘liq ma’lumot o‘chirish, retention va DSR jarayoni hali yo‘q. Eksport JSONda bu ochiq ko‘rsatilgan. Telefon va manzil kabi shaxsiy ma’lumotlar faylga yozilgani sabab foydalanuvchi uni xavfsiz saqlashi lozim.

## Tekshiruv

- `backend/test/v183PrivacyExport.unit.test.js`: 7/7 PASS (ruxsat, egasi, ma’lumot ro‘yxati, 5000 limit, rollback va ulanish xatosi).
- `frontend/test/v183PrivacyExport.test.js`: 1/1 PASS.
- Frontend barcha testlar: **1715/1715 PASS**.
- Backend barcha unit testlar: **1699/1728 PASS**, eski 29 ta modul/dependency blokirovkasi saqlangan (`express`, `jsonwebtoken`, `bcrypt`, `pg` paketlari yo‘q).
- Frontend import grafigi PASS; CJS sintaksisi PASS. Vite production build, browser E2E, haqiqiy PostgreSQL RLS/transaction integratsiyasi, Telegram va staging smoke testlar bajarilmagan.
- Asl 185 qaror reyestri o‘zgartirilmagan. Yangi SQL migratsiya yo‘q. Production-ready: **YO‘Q**.

## Keyingi bosqichlar

#160/#176 Quick Manual Booking (telefon kelishuvi, mijozning identifikatsiya/rozilik modeli aniq bo‘lmaguncha OTP bypass qilmaslik), #177 Admin suspend va bron xavfsizligi, #110–#122 shop jamoasi/RBAC, #175 xavfsiz shop yopish, #134 to‘liq privacy/retention, #179 jismoniy tozalash worker; undan keyin real DB, Telegram, browser E2E, full build va backup restore sinovlari.
