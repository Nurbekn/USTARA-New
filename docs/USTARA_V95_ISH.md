# USTARA v95 — #23 “Xizmat boshlandi”

- Sartarosh mijozni chaqirgandan keyin alohida **Xizmat boshlandi** tugmasini bosadi; server `in_service` deb saqlaydi va auditga yozadi.
- Xizmat davom etayotganda **Keyingisini chaqirish** bloklanadi; xizmat boshlangan mijoz **Kelmadi** yoki **Chiqib ketdi** deb yakunlanmaydi. Faqat **Xizmat tugadi** bosiladi.
- Oldingi called→served API mosligi saqlanadi, lekin yangi sartarosh UI avval start talab qiladi.
- QR/mijozlar holatni ko‘radi; navbatdan chiqish tugmasi xizmat boshlanganida ko‘rinmaydi.
- SQL migratsiya `started_at`, yangi holat va audit action’ni qo‘shadi; mavjud 42 migratsiyaga tegmaydi. Avtomatik production migratsiya bajarilmaydi.
- Xizmat boshlanish vaqti ikkita mustaqil qurilmada bir vaqtda yuborilganda bitta hodisa yozilishi uchun PostgreSQL integratsiya testi mavjud, lekin real serverda hali **SKIP**.
- #23 to‘liq yopilmagan; “Keldi” va live E2E alohida tasdiqlanishi kerak.
