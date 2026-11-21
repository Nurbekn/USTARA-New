# USTARA v13 — mijoz bron xizmatlarini tahrirlashi

**Bosqich:** 3/10 (qisman)

- Mijoz `Bronlarim` bo‘limida vaqt yoki xizmatlarni tahrirlaydi.
- Backend tanlangan faol xizmatlarning server narxi va davomiyligini qaytaradi, ularning yangi davomiyligiga mos slotlarni hisoblaydi.
- PATCH eski bronning vaqtini va xizmat identifikatorlarini tasdiqlash uchun yuboradi; narx yangilangan bo‘lsa avtomatik rozilik olinmaydi.
- Narx yoki xizmatlar boshqa joyda o‘zgarsa eski bron tranzaksiyada saqlanadi.
- Qo‘shimcha DB-test maketlaridagi eskirgan sessiya SQL muammolari tuzatildi; ishlab turgan login kodi zaiflashtirilmadi.

**Tekshirilgan:** backend 326/326, frontend 127/127, frontend Vite build PASS, 185 qaror reyestri 28 migratsiya strukturaviy audit PASS.

**Hali tekshirilmagan:** haqiqiy PostgreSQL parallel sinovlari, brauzer E2E, haqiqiy Telegram; production tayyor emas.

Davom nuqtasi: `docs/USTARA_PROGRESS.md` va `docs/USTARA_185_NAZORAT.csv`. Maxfiy kalitlar ZIP ichida yo‘q.
