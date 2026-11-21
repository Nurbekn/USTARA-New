# USTARA v167 — asl #81–#87 qarorlar: izoh pin va spam himoyasi

## Asos va yondashuv

- Kirish: `USTARA-v166-185-Contextual-Onboarding-Media-Seven-Decisions.zip`.
- Asl qarorlar: `docs/USTARA_185_NAZORAT.csv`. SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`.
- **7 ta qaror ko‘rib chiqildi, 7 ta yangi manba izi qo‘shildi: 82 → 89/185.** Qolgan 96 tasi indekslanmagan. Manba izi tayyorlik yoki E2E ishlash isboti emas.
- Barcha avvalgi SQL migratsiyalari va asl reyestr o‘zgartirilmagan. Production ma'lumotlari yoki haqiqiy PostgreSQL bazasi bilan ishlanmadi.

## Asosiy yangi ishlar (#82)

1. `20261221_social_comment_pins.sql` forward migratsiyasi: `social_comments.pinned BOOLEAN NOT NULL DEFAULT FALSE`; **bitta post uchun bitta pinlangan izoh** shartini saqlaydigan partial unique indeks; spam so‘rovini tezlashtiradigan `(user_id,created_at)` indeksi.
2. `PUT /api/social/posts/:id/comments/:commentId/pin` — autentifikatsiyalangan sartarosh uchun. Postning haqiqiy `barbers.user_id` egasi serverda tekshiriladi; mijoz/admin yoki boshqa sartarosh pin qila olmaydi. Post qatori tranzaksiya davomida bloklanadi, eski pin va yangi pin atomik almashadi. Bazaga yozish tasdiqlanmaguncha API muvaffaqiyat deb javob bermaydi.
3. Izohlar ro‘yxati va post preview'larida `pinned` holati olinadi, pinlangan izoh birinchi chiqadi; mijoz bu holatni faqat ko‘radi. Pin tugmasi sartaroshning **Portfolio → Post → Izohlar** qismiga ulandi. O‘zgartirilgandan keyin ro‘yxat serverdan yangidan olinadi. Sartarosh HTML/JS client tekshiruviga emas, **serverdagi ownership**ga tayanadi.
4. Izoh yaratishdan oldin server DB soatidan foydalanib oxirgi 1 daqiqada postga 5 tadan, akkauntga 10 tadan ko‘p izohni va so‘nggi 10 daqiqada bir postga ayni matnni takror yuborishni cheklaydi (`429`). Bitta postdagi yozishlar post row lock bilan ketma-ketlashadi. **Turli postlardagi parallel race** uchun global limit qat’iy serializatsiya isboti emas; bu qisman anti-spam himoya.
5. Migratsiya tarixiy SQL fayllariga tegmasdan 50-forward migratsiya sifatida bootstrap/verify zanjiriga qo‘shildi. Migratsiya sonini statik tekshiradigan testlar va offline auditlar yangilandi.

## #81–#87 holatlar

| Qaror | Hozirgi dalil | Ochiq qismi |
|---|---|---|
| 81 — professional Ilhom post muharriri | Mavjud 3 bosqichli media/preview/tavsif editori, serverdagi post yaratish | Filtr/crop/trim kabi professional vositalar va brauzer/upload E2E yo‘q |
| 82 — izoh javob, pin va spam moderatsiyasi | Pin endpoint va Portfolio UI; serverda takroriy/tez izohlar limiti; post shikoyati | Threaded reply, comment-specific report, moderator appeals, DB race E2E yo‘q |
| 83 — Admin kontent moderatsiyasi | Mavjud post shikoyat ro‘yxati va Admin postni o‘chirish | Izoh shikoyati, apellyatsiya, to‘liq qaror auditi yo‘q |
| 84 — Security Center va sessiyalar | Device sessions, revoke API va kabinet komponenti bor | Real PostgreSQL va to‘liq session/phone E2E tasdiqlanmagan |
| 85 — sartaroshning offline xavfsiz sinxroni | Internet uzilishi/tiklanishi bo‘yicha xavfsiz ogohlantirish bor | Offline mutation queue, konfliktlar, idempotent sinxron **YO‘Q** |
| 86 — Smart Client Card | Booking ownership asosidagi ma’lumot maxfiyligi tekshirildi | Smart Client Card UI, ruxsat va shaxsiy qaydlar tizimi **YO‘Q** |
| 87 — qayta bron va sevimli to‘plamlar | Eski bron xizmatlari bilan qayta tanlash, narx va slotni yangidan server tekshirishi bor | Nomi bor sevimli service-to‘plamlar va birgalikdagi collections **YO‘Q** |

## Haqiqatan o‘tkazilgan testlar

- Frontend to‘liq unit suite: **1651/1651 PASS**, 0 skip, 0 fail.
- Backend to‘liq unit suite: **1595/1624 PASS**, 29 fail. Ular muhitdagi `express`, `pg`, `jsonwebtoken`, `bcrypt` kabi o‘rnatilmagan npm paketlariga bog‘liq; suite **yashil emas**.
- v167 maqsadli unit va manba-audit testlari: **12/12 PASS**.
- Avvalgi migration-hardcode testlari: **23/23 PASS** (bir nechta nested test bilan).
- v153 frontend source graph: **PASS**. O‘zgargan JSX fayllari TypeScript parser yordamida tekshirildi.
- Offline migratsiya auditi: 50 forward, 2 rollback: **PASS**. Bu haqiqiy PostgreSQL migratsiyasi emas.
- Real PostgreSQL migratsiya va multi-session concurrency, to‘liq foydalanuvchi OTP/Telegram, browser E2E va production Vite build: **NOT RUN**.

## Keyingi navbat

- #82 ning izohlarga javob, shikoyat va apellyatsiya qismi; DB concurrency/rate-limit race sinovlari.
- #85 offline xavfsiz sinxron dizaynini alohida tasdiqlash va idempotency chegaralarini aniqlash.
- #86 Smart Client Card uchun privacy, access policy va delete/retention qarorlarini ishlab chiqish.
- #87 sevimli to‘plamlar nomi, saqlash va sharing ACL.

**Natija:** 89/185 manba izi; bu production tayyorligi emas. Migration yoki real ma’lumot o‘zgartirilmadi.
