# USTARA v92 — navbat status va commit xavfsizligi

**Maqsad:** 185 qarorning #128 bilan bog‘liq QR/walk-in navbat chiqishida server natijasi xato bo‘lgan paytdagi xavflarni kamaytirish.

- QR status javobi qat’iy tekshirildi; zararli/noto‘g‘ri response yoki maxfiy qo‘shimcha maydon UI'ga chiqmaydi.
- Refresh xatosida eski navbat taklifi, Telegram va chiqish tugmalari ishlatilmaydi; majburiy status recheck.
- QR yuborish natijasidan keyin alohida QR status o‘qish talab qilinadi; eski auth token bilan confirm natijasi yangi userga chiqarilmaydi.
- Sartaroshning queue mutation transaction'ida noaniq COMMIT xavfsiz `queue_result_unknown` + pool discard.
- 31 ta yangi testlar va eski regressiyalar bilan mosligi tekshirildi.

**Cheklov:** haqiqiy PostgreSQL, React/Vite browser va Telegram integratsiya testlari bajarilmagan; talab hali qisman.
