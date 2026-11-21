# USTARA v180 — #172–#178 qarorlar manba auditi va profil xabari xavfsizligi

**Asos:** v179 ZIP ichidagi asl `docs/USTARA_185_NAZORAT.csv`. Ushbu versiya audit natijasida **179/185** qarorlar manbalarini ko‘rib chiqdi; 6 tasi navbatda. Bu funksiyalar tugallandi yoki production-ready degani **emas**.

## Amalda yangilangan funksiya: #178

- Avvaldan mavjud `POST /api/barbers/:id/profile-report`, o‘z statusini tekshirish endpointi va Admin tekshiruvi saqlangan. Yangi endpoint yoki SQL migratsiya yaratilmagan.
- **Fail-closed takroriy yuborish:** oldingi xabar statusi `ready` bo‘lmaguncha yoki server statusini o‘qish xato bo‘lsa, forma yangi POST yubormaydi. Avvalgi yuborish tasdiqlanmaganda birinchi navbatda server statusi qayta tekshiriladi. Holat o‘qib bo‘lmasa, foydalanuvchi qayta tekshirish tugmasidan foydalanadi. POST natijasi noma’lum bo‘lsa, yuborildi deb aytilmaydi.
- `uz/ru/en` tarjimalari qo‘shildi. Profil tili forma uchun uzatiladi; sabablarga mos server qiymatlari o‘zgarmadi.
- Avvalgi profil va sessiya so‘rovlarini abort qilish, begona profilga natija chiqmasligi, shaxsiy ma’lumotlarni ommaga ochmaslik va Admin tasdig‘isiz profilni o‘zgartirmaslik saqlandi.

## #172–#178 qarorlar holati

| # | Talab | Audit |
|---|---|---|
| 172 | Profilni qidiruvdan yashirish | **BEKOR**. Qayta yaratilmagan. |
| 173 | Mijozga bo‘sh vaqt va navbat | **QISMAN**. Band bronlar maxfiy; real navbat ETA va haqiqiy E2E tekshiruvlari qolgan. |
| 174 | Bron tafsilotida xarita va qo‘ng‘iroq | **QISMAN**. Avvalgi mavjud profil/bron havolalari bor, real brauzer tekshiruvi qolgan. |
| 175 | Shop yopilganda o‘chirish | **ISHLAB CHIQILMAGAN**. Shop modeli mavjud, lekin xodimlar, bronlar va huquqiy saqlashga mos o‘chirish siyosati tasdiqlanmagan. Hech qanday ma’lumot o‘chirilmadi. |
| 176 | Telefon orqali qo‘lda bron, qo‘shimcha xabar shart emas | **ISHLAB CHIQILMAGAN**. Qo‘lda bron qilish mexanizmi hali yo‘q. |
| 177 | Admin suspend qilganda bronlar xavfsizligi | **ISHLAB CHIQILMAGAN**. Foydalanuvchining o‘zi akkauntini faolsizlantirishi Admin suspension bilan bir xil emas. |
| 178 | Profil xatosi haqida xabar | **QISMAN, yaxshilandi**. Serverga bog‘liq xavfsiz takror yuborish va uch tilli forma; jonli DB/HTTP/browser sinovi qolgan. |

## Sinovlar

- **Yangi maqsadli testlar:** 9/9 PASS (6 frontend, 3 backend audit).
- **Avvalgi profil xabari testlari:** 29/29 PASS (eski testlar yangi xavfsizlik qoidasi hamda tarjima manbasiga moslashtirildi).
- **Frontend umumiy unit:** **1703/1703 PASS**.
- **Backend umumiy unit:** **1679/1708 PASS**; qolgan **29 ta test FAIL**, v179 dagi o‘sha nomli testlar (`express`, `pg`, `bcrypt`, `jsonwebtoken` paketi o‘rnatilmagan). To‘liq backend **PASS emas**.
- **Offline migratsiya auditi:** 56 forward + 2 rollback, PASS. Yangi migratsiya yo‘q, haqiqiy DBda hech narsa bajarilmadi.
- **Frontend source graph:** PASS (216 JS, 38 CSS, 681 import). **Vite build NOT_RUN.**
- **PostgreSQL/Telegram/browser E2E/production deploy:** **NOT_RUN**.

## Keyingi bosqich

v181 — **#179–#185** (7 ta raqam, lekin oldin indekslangan yoki bekor qilinganlar takror sanalmasligi mumkin). Manba indeksining 185/185 bo‘lishi ham barcha funksiyalar to‘liq bajarildi degani emas: keyin ochiq qilingan qarorlar va jonli integratsiya sinovlari alohida yakunlanishi kerak.
