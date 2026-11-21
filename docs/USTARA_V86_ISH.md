# USTARA v86 — bron receipt va recovery mustahkamlash

1. Serverdan kelgan bronni **muvaffaqiyat sifatida ko‘rsatishdan oldin** ID, customer/barber/service scope, status, time, davomiylik va narx bo‘yicha tekshirish.
2. Bekor qilingan/rad etilgan/tugallangan *oldingi* bronni yangi bron kabi yashil tasdiqlash bilan ko‘rsatmaslik; statusga mos sarlavha.
3. Server tasdiqlagan narx yo‘q bo‘lsa, taxminiy narxni «Kelishilgan» demaslik; bron tafsilotini ochish havolasi.
4. Noma’lum/nomuvofiq 2xx javobni idempotent tiklash talab qiladigan holat sifatida saqlash (yangi bronni avtomatik yubormaslik).
5. Recovery GET qaytargan yozuv aynan joriy customer profile bilan mos bo‘lishi; +28 yangi test va regressiya audit.

Frontend 430/430 PASS, tanlangan backend 38/38 PASS. PG/Chrome/Telegram/Vite E2E ishlatilmadi; production-ready emas.
