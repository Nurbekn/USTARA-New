# USTARA v96 — #23 «Keldi»

**Bosqich:** `waiting → called → arrived → in_service → served` (yangi UI).

- Sartarosh mijozni chaqirgach, uning kelganini **Keldi** tugmasi bilan tekshiradi. Bu tasdiqlashni faqat tegishli tasdiqlangan sartarosh bajaradi.
- Keyingi **Xizmat boshlandi** tugmasi `arrived` holatidan ishlaydi. Xizmat boshlangach, avvalgi kabi **Xizmat tugadi**.
- Chaqirilgan, ammo kelmagan mijoz uchun **Kelmadi** mavjud; kelgani tasdiqlangan mijozni «Kelmadi»ga aylantirib bo‘lmaydi.
- «Keldi» bo‘lgan navbat xizmat boshlanguncha boshqa mijozni chaqirish bloklanadi.
- Qo‘lda kelgan mijoz chiqib ketsa, sartarosh **Chiqib ketdi** holatini tanlashi mumkin.
- Har bir kelish auditda `arrived` sifatida qayd etiladi; bir xil so‘rovni qaytarish ikkinchi audit yozmaydi.
- QR va mijozning bog‘langan navbat sahifalari kelganlik statusini ko‘radi, boshqalarning shaxsiy ma’lumotlarini olmaydi.
- Eski `called → in_service` API mosligi saqlangan. Ushbu kompatibil yo‘l bilan eski tarixiy bronlar buzilmaydi.
- Migratsiya productionga avtomatik yuborilmaydi; faqat maxsus test DB da oldindan ko‘rib chiqib amalga oshirish kerak.
- 185 talabdan #23 **QISMAN**: DB/Chrome/E2E haqiqiy testlari qolgan.
