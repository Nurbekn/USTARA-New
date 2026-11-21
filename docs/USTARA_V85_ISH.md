# USTARA v85 — 5 asosiy ish

1. **Tasdiqlash snapshoti** — ko‘rsatilgan xizmatlar ro‘yxati, nomi, vaqt, narx, duration, bekor qilish shartlari bir martalik frozen snapshotga olinadi.
2. **Stale quote guard** — server javobiga olingan vaqt qo‘shildi; 120 s o‘tgach yoki yangi API javobi kelgach eski oynada POST yo‘q.
3. **Selection race** — oyna ochiqligida boshqa xizmat/sana/slot/narx/policy/duration o‘zgarsa eski ko‘rinish tasdiqlanmaydi; refresh yo‘li bor.
4. **Session race** — POST natijasi kelishidan oldin akkaunt yoki token almashsa, eski akkauntga oid muvaffaqiyatli natija yangi akkauntda ko‘rsatilmaydi.
5. **Test** — +40 yangi frontend testi, frontend 402/402 PASS, tanlangan backend 39/39 PASS, qaror/migratsiya offline PASS, checkpoint va ZIP audit.

**Scope:** Frontend confirmation UX. Server hali ham narx/duration/policy/slotni tranzaksiya ichida tekshiradi. Real PG, mobil/Chrome/Telegram E2E, Vite build BLOCKED (`vite: not found`). Production-ready EMAS.
