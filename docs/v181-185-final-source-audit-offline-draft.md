# USTARA v181 — #179–#185 yakuniy manba auditi

**Asos:** v180 ZIPdagi o‘zgartirilmagan `docs/USTARA_185_NAZORAT.csv` (SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`).

**Natija:** **185/185** qaror manbasi ko‘rib chiqildi. Bu **100% production tayyorligi emas**: audit statuslari `PARTIAL_SOURCE_GAP`, `NOT_IMPLEMENTED` va `CANCELLED_BY_USER` bo‘lishi mumkin. `productionReady: false`.

## Yangilangan #183 — Offline tanlovning saqlash holati

- Mijoz yoki mehmon xizmati, sanasi va vaqtini tanlaganda `sessionStorage`ga 5 daqiqagacha saqlanadigan, shaxsiy ma’lumotlarsiz allowlist qoralama yoziladi.
- **Saqlangan**, **saqlanmadi**, **saqlash muddati tugadi** holatlari uz/ru/en matnlari bilan ko‘rsatiladi. Xatoda yoki muddat tugaganda qayta saqlash tugmasi bor.
- Brauzer xotirasi `setItem()`ni indamay e’tiborsiz qoldirsa ham `getItem()` bilan qayta tekshirish ishlaydi: muvaffaqiyatsiz yozuvni `saved` deb ko‘rsatmaydi.
- Bir xil qoralama qayta saqlanganda muddati avtomatik uzaytirilmaydi; qayta saqlash foydalanuvchining aniq harakati bo‘lishi kerak.
- Qoralama **bronga teng emas**, bo‘sh slotni ushlab turmaydi, tarmoq uzilganda bron so‘rovi avtomatik qaytarilmaydi, foydalanuvchi JWT/telefon/narxi saqlanmaydi.
- Yangi DB migratsiya yoki mavjud bron jarayoniga o‘zgartirish kiritilmagan. Haqiqiy offline PWA mutatsiyalarni sinxronlash ishlab chiqilmagan.

## #179–#185 qarorlar holati

| # | Talab | Manba auditi holati |
|---|---|---|
| 179 | Private Booking Note | **ISHLAB CHIQILMAGAN.** Xavfsiz shaxsiy izohlar, ruxsatlar va saqlash siyosati talab etiladi. |
| 180 | Xizmat davomiyligi 5 daqiqalik qadam | **QISMAN.** Server servis validatsiyasi va slot generatsiyasida 5 daqiqalik qadam bor. PostgreSQL E2E qolgan. |
| 181 | Butun shop pauzasi hozircha kerak emas | **BEKOR QILINGAN.** Yangi jarayon yaratilmagan. |
| 182 | Takroriy profil preview savoli bekor | **BEKOR QILINGAN.** Yangi jarayon yaratilmagan. |
| 183 | Offline amalning oddiy saqlash holati | **QISMAN, YAXSHILANDI.** 5 daqiqalik qoralama holati UIga qo‘shildi; offline amalni serverga sinxronlash yo‘q. |
| 184 | Faqat ochilgan slotlarga bron; kun limiti yo‘q | **QISMAN.** Ochiq slotlar ish vaqti va band oraliqlardan tuziladi. Jonli DB/race testlari kerak. |
| 185 | Slot barcha mijozlarga ochiq | **QISMAN.** Ommaviy slot API ochiq; bron yaratish serverda mijoz avtorizatsiyasi talab qiladi. Jonli E2E kerak. |

## Haqiqatan bajarilgan sinovlar

- #179–#185 va #183 maqsadli testlar: **12/12 PASS**.
- Avvalgi va yangi draft testlari: **35/35 PASS**.
- Frontend barcha mavjud Node unit testlari: **1710/1710 PASS**.
- Backend barcha mavjud Node unit testlari: **1684/1713 PASS**, **29 FAIL** — v180 dagi aynan bir xil muvaffaqiyatsiz testlar. `express`, `pg`, `bcrypt`, `jsonwebtoken` paketlari ushbu muhitda yo‘q. To‘liq backend suite PASS deb da’vo qilinmaydi.
- Frontend import/source graph **PASS**, JSX statik transpilation diagnostikasi **0**.
- PostgreSQL/Telegram/brauzer E2E/Vite production build **NOT_RUN**.
- Asl 185 qaror reyestri va eski migratsiya SQL fayllari fayl hashiga ko‘ra saqlangan. Hech bir migratsiya real bazaga qo‘llanmagan.

## Keyingi bosqich — production va funksional bo‘shliqlar

Qisman qolgan va ishlab chiqilmagan qarorlarni alohida backlog asosida yopish zarur: maxfiy booking note, ko‘p xodimli shop/jamoa ruxsatlari, qo‘lda bron qilish, Admin suspension oqimi, Privacy Center, chat real-time imkoniyati, offline sinxronlash va boshqalar. Keyin npm dependency, PostgreSQL integratsiya, Telegram, browser E2E, deployment va backup/restore sinovlarini o‘tkazish lozim. **185/185 manba auditi tugadi, ammo loyiha hali to‘liq tugagani tasdiqlanmagan.**
