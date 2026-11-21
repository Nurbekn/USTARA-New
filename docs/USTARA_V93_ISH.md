# USTARA v93 — sartarosh navbatini xavfsiz yangilash

**Maqsad:** #23, #29, #31, #32 navbatni boshqarish talablarida UI xatolari va parallel so‘rovlar oqibatini kamaytirish.

- GET queue/qr/offers ma’lumotlari qat’iy qabul qilinadi, maxfiy qo‘shimcha field UI'ga chiqmaydi.
- Postgres BIGINT maydonlari `pg` orqali decimal string qaytishini hisobga olgan holda ID'lar xavfsiz normalizatsiya qilinadi.
- Bir-birini quvgan eski polllar navbat holatini almashtirmaydi.
- Refresh xatolaridan keyin oldingi navbat, QR, offer va claim-code ma’lumotlari yashiriladi; qayta tekshiruvdan so‘ng ochiladi.
- Akkaunt almashganda oldingi navbat ko‘rinishi va pending amal natijasi tozalanadi.
- Har bir mutation vaqtida ikkinchi mutation yuborish to‘xtatiladi; COMMIT noaniqligi natijani qayta tekshirishni talab qiladi.
- 58 ta yangi test. Real PG va mobil browser E2E hali bajarilmagan.
