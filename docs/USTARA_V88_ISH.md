# USTARA v88 — qilingan amaliy o‘zgarishlar

- Maqsad: #159 mijoz telefoni faqat o‘z bronida ko‘rinsin, directory/profile API orqali tarqalmasin.
- `backend/controllers/customersController.js` — barter directory va customer detail SELECT querydan telefon olib tashlandi, strict allowed-fields response; admin va own profile saqlanadi; ID validatsiya + no-store.
- `backend/controllers/bookingsController.js` — private booking list/detail uchun no-store.
- `backend/test/v88CustomerPhonePrivacy.unit.test.js` — 25 regressiya testi.
- Koddan mijoz telefoni o‘z bronida, barber roliga scope qilingan holda ko‘rsatilishi saqlanadi.
- Sartarosh akkauntining login telefonini ommaga chiqarish qo‘shilmadi: bunga alohida ko‘rsatish sozlamasi va maxfiylik qarori kerak.
- 185 qaror va 42 oldingi migratsiya o‘zgarishsiz.
