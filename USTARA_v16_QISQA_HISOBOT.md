# USTARA — v16 qisqa hisobot

**Manba:** v15 ZIP. **Bosqich:** 3 (qisman). **Maqsad:** bekor qilishning barcha API yo‘llarini bitta xavfsiz tranzaksiyaga ulash.

- PUT/DELETE cancellation birlashtirildi; takroriy cancellation `200/replayed`, qo‘shimcha Telegram xabari yo‘q.
- Boshqa mijozga tegishli bronni bekor qilish rad etiladi; tugallangan/rad etilgan bronlar qayta ochilmaydi.
- COMMITdan keyingi tafsilot o‘qish xatosi tasdiqlangan amalni xato deb ko‘rsatmaydi.
- Haftalik ish vaqti jadvalini o‘zgartirishga statement timeout qo‘shildi.
- Backend 342/342, frontend 135/135, frontend build PASS; offline audit 185 qaror, 29 migratsiya.
- Real PostgreSQL/brauzer/Telegram E2E va sartarosh cancellation policy (#17) **hali qilinmagan**.

Keyingi safar faqat `docs/USTARA_LATEST_CHECKPOINT.md` va kerakli yangi kodlarni o‘qing; qolgan katta tarix `docs/USTARA_PROGRESS.md`da.
