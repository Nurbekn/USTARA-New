# USTARA v81 — #144 booking recovery (2026-11-19)

**Asos:** `USTARA-4-Bosqich-Booking-Commit-Integrity-v80.zip` (845 fayl). Production-ready **EMAS**.

## 5 ish
1. `backend/services/bookingRecovery.js` — mijoz ID bo‘yicha read-only recovery; boshqa mijoz broni ko‘rinmaydi; `found:false` yakuniy muvaffaqiyatsizlik deb qaralmaydi.
2. `backend/controllers/bookingsController.js`, `backend/routes/bookings.js` — auth talab qilinadigan `GET /api/bookings/recovery/:requestId` yangi API; boshqa bron yaratmaydi va `/:id` dan oldin joylashgan; no-store.
3. `frontend/src/pages/user/barber/createBooking.js` — noaniq POST so‘rov UUID’sini saqlash, boshqa vaqtga bexosdan yangi bron yuborishni bloklash, GET bilan tiklash; hisob almashganda ID ni ajratish.
4. `frontend/src/pages/user/barber/InlineBooking.jsx`, `pages/auth/utils/session.js` — «Bron holatini tekshirish» UI, noaniqlik haqida ogohlantirish, ixtiyoriy tasdiqlangan voz kechish, logoutda eski request ID ni tozalash.
5. 9 backend va 12 frontend unit test; alohida faqat vakolatli test bazasida ishga tushadigan PG integratsiya ssenariysi; paket skriptlari va hujjatlar.

## Haqiqiy lokal natijalar
- Frontend unit: **290/290 PASS**.
- Tanlangan backend unit: **123/123 PASS** (yangi 9 tasi).
- Keng backend unit: **704 PASS / 26 MODULE_NOT_FOUND FAIL** (`pg`, `express`, `bcrypt`, `jsonwebtoken` paketlari yo‘q). 26 ta test muvaffaqiyatli hisoblanmaydi.
- PostgreSQL integration: **NOT_RUN/BLOCKED** (`pg` npm paketi, server va vakolatli test URL yo‘q).
- Vite/React production build, Chrome, Telegram va real HTTP E2E: **NOT_RUN**.
- 185 qaror nazorat jadvali va 42 forward migratsiya, 2 rollback fayli saqlanadi; #144 **qisman**.

## Qo‘shimcha xavf
- Recovery `found:false` natijasi original so‘rov hali ishlayotganda ham qaytishi mumkin. Frontend avtomatik ravishda yangi request ID yaratmaydi; foydalanuvchi holatni qo‘lda tekshirib, eski noaniq urinishni ataylab tark etishi mumkin. Ikki bron xavfi butunlay yo‘qolmadi.
