# USTARA v146 — sartarosh operatsion ekranlari UZ/RU/EN

2026-11-20. Baseline: `USTARA-v145-185-Account-Security-Barber-Languages.zip` (1 134 fayl), original archive SHA-256 `ba82bf6aa08c1222758385599919d48f9f3edf24a9471a2b14fddaaa8d033d8a`.

## 185 qaror #76 — 7 ta ish

1. **Xizmatlar:** xizmat ro‘yxati, narx va davomiylik, yaratish/tahrirlash/o‘chirish tasdiqlari va xavfsiz arxiv xabarlari UZ/RU/EN. 5 000 so‘mlik narx qadami, 5 daqiqalik davomiylik qadami, saqlash API o‘zgarmadi.
2. **Portfolio:** profil statistikasi, rasm/video tanlash, fayl o‘lchami ogohlantirishlari, caption, AI tavsifi, post chop etish va o‘chirish UI matnlari tarjima qilindi. Foto/video cheklovi 25/50 MB, post API o‘zgarmadi. Profilga qaytish havolasi faqat tekshirilgan til parametrini uzatadi.
3. **Ish jadvali:** bron qabul qilish switchi, yuklanish, tasdiqlash va saqlash matnlari tarjima qilindi. Haqiqiy saveWorkingHours / setBookingAcceptance so‘rovlari o‘zgarmadi.
4. **Maxsus kalendar:** ta’til, bir kun dam, maxsus soat, tanaffus, 90 kun chegarasi, sanalarni saqlash/o‘chirish yozuvlari uch tilga moslashtirildi. Kalendar sanalari va 5-minut qadam o‘zgarmadi.
5. **Takroriy tanaffuslar:** haftalik/sanali rejim, 8 tagacha tanaffus, hafta kunlari va xatolik/saqlash xabarlari uch tilda. `day_of_week` raqamli qiymati va break interval API o‘zgarmadi.
6. **Bronni bekor qilish qoidalari:** deadline presetlari, 280 belgilik ixtiyoriy izoh, oldingi bronlarga tegmaslik haqidagi ogohlantirish va validatsiya matnlari tarjima qilindi. `cutoff_minutes` va izoh mazmuni/API aynan saqlandi.
7. **Ommaviy profilni oldindan ko‘rish:** tekshiruv mezonlari, tasdiqlanishi, tayyorlik hisoblagichi, yangilanmagan tahrirlar ogohlantirishi hamda tilni saqlovchi ommaviy havola qo‘shildi. `publicProfilePreview` tekshiruv modeliga va ulashish xavfsizligiga tegilmadi.

## Tekshiruv dalillari

- Yangi sof JS tarjima moduli: `frontend/src/pages/barber/barberOpsLocaleV146.js`; uz/ru/en va allowlist locale orqali qo‘llanadi, noto‘g‘ri locale -> Uzbek default.
- 18 ta yangi unit-test: `frontend/test/v146BarberOperationsLanguages.test.js`; **18 PASS / 0 FAIL**.
- Frontend unit regressiyasi: **1 368 PASS / 0 FAIL / 0 SKIP**.
- Backend unit regressiyasi: **1 412 PASS / 26 FAIL**; xato nomlari v145 bilan **aynan bir xil**, backend kodi o‘zgarmadi.
- 7 ta JSX ekran TypeScript/TSX parser sinovi: **PASS**; dependency talab qilmaydigan testlar.
- Vite build: **BLOCKED** (`vite: not found`). `node_modules`da paketlar o‘rnatilmagan, Vite paketini yangi loyiha kodi deb ko‘rsatish mumkin emas.
- Haqiqiy PostgreSQL, mobil browser, Telegram E2E, prod deploy: **NOT_RUN**.
- Asl 185 javob CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` **o‘zgarmadi**; 55 ta `.sql` fayl baytma-bayt o‘zgarmagan. Backend manba 491 ta fayl baytma-bayt saqlangan.

## Cheklovlar va keyingi reja

#76 hali **QISMAN**: ayrim server xabarlari, portfolio ichidagi boshqa komponentlar, boshqa sartarosh operatsion oynalari va boshqa UI bo‘limlari hali to‘liq tarjima qilinmagan. Birinchi imkoniyatda `npm ci` bilan frontend va backendni to‘liq o‘rnatib Vite build, mobil brauzer hamda alohida `ustara_test_db` PostgreSQL integratsiyasini tekshirish kerak. Asl 185 javobga hech qanday o‘zgartirish kiritilmaydi. Production-ready: **YO‘Q**.
