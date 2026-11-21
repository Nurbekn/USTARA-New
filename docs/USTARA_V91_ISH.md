# USTARA v91 — Queue exit va stale holat

## Maqsad
185 talabdan **#128 — navbatdan ixtiyoriy chiqish** bo‘yicha COMMIT noaniqligi, kiruvchi ma’lumotlar va offline UI xavflarini kamaytirish.

## Yaxshilanishlar
- Transaction COMMIT natijasi noaniq bo‘lsa qayta ishlatilmaydigan PostgreSQL connection (client.release(true)) va commitUncertain marker.
- QR/manual self exit HTTP 503 `queue_result_unknown`: noma’lum natijani yolg‘on bekor qilindi deb ko‘rsatmaydi.
- Manual queue ID: strict canonical PostgreSQL int4; `0x10`, `1e2`, `01` rad etiladi.
- PostgreSQL 40001 serialization failure as 409 `queue_busy`.
- Manual queue GET javobini tekshirish, duplicate ID va max 10 ticket, offer timestamp validity, private fields chiqarib tashlash.
- Polling xatosida eski ticket/actionlar olib tashlanadi; empty vs unavailable aniq ajratiladi; retry/online/visibility refresh.
- QR status xatosida eski ticket/actionlar yashiriladi; noaniq leave natijasida status qayta tekshiriladi.
- 58 yangi regression testi.

**Cheklov:** haqiqiy PostgreSQL, Chrome, Telegram sinovlari bajarilmagan. 185 qaror/funksiyalar tugagan degani emas.
