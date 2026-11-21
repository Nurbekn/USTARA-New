# USTARA v107 — #153 Safe Day Closing, 9 yo‘nalish (2026-11-20)

**Manba:** USTARA v106 (990 fayl). **Ishlab chiqarishga tayyorlik:** YO‘Q.

1. `barber_day_closures` — sartarosh va mahalliy sanaga bog‘langan yopilish holati, optimistik `revision`.
2. `barber_day_close_events` — yopish/qayta ochish audit voqealari, eskirgan qayta so‘rovlar idempotent.
3. `GET /api/queue/day-close/preview` — shaxsiy ma’lumotsiz hisoblar, `closed` va `revision`, PostgreSQL `Asia/Tashkent` sanasi.
4. `POST /api/queue/day-close` — sartaroshning alohida tasdig‘i, 30 soniyalik yangiligi, 8 ta bloklovchini DB ichida qayta tekshirish, atomik yozish.
5. `POST /api/queue/day-close/reopen` — faqat bugungi sana, `revision` sharti va alohida audit; kechagi kun emas.
6. SQL `ustara_effective_day_schedule` — yopiqlikni markazdan tekshiradi; kelajakdagi odatiy ish kunlarini yopmaydi. Bron, slot, QR-approve va walk-in jadval filtrlari shu funksiya bilan ishlaydi.
7. QR yaratish yopilgan kunda rad etiladi; yangi qo‘shish va tasdiqlashlar umumiy jadval filtri orqali cheklanadi.
8. Frontend: alohida ikki bosqichli tasdiq, akkaunt/epoch/30s tekshiruvi, noaniq commitdan so‘ng qayta status olish, avtomatik cancel yo‘q.
9. Public queue API va ko‘rinishi: `day_closed` holati, yopiq kunda ETA yo‘q, shaxsiy ma’lumot oshkor qilinmaydi.

**Migratsiya:** 45 forward / 2 eski rollback (yangi rollback yo‘q). Avvalgi 44 SQL fayl o‘zgarmadi. `backend/database/bootstrap.sql` va verify inventarlari 45 ga yangilandi; 185 qaror CSV o‘zgarmadi.

**Cheklov:** Haqiqiy PostgreSQL integratsiya testlari, Vite build va mobil brauzer sinovlari mavjud muhitda bajarilmagan. Endpointlar ishlashi uchun avval yangi migratsiyani sinov muhitida qo‘llash kerak. Qo‘lda yakunlanmagan kechagi navbatlar ishlayotgan bo‘lsa, yopish bloklanadi. 26 ta oldingi backend dependency FAIL qolgan. #153 **QISMAN**, production-ready emas.
