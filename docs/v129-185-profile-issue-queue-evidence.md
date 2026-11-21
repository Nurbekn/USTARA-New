# USTARA v129 — 185 qarorga mos profil xatolari navbati (2026-11-20)

## Asos va qarorlar
- **Asos:** `USTARA-v128-185-Profile-Issue-Reports.zip`, 1 071 fayl, SHA-256 `f1cd54f10aa3ec92055245e5192426733d66056ab78adc36b143eed54c1b6f15`.
- 185-qaror reyestridan aynan **#178 — Profildagi xatoni bir tugma bilan bildirish**, **#49 — Dalilli shikoyat va apellyatsiya**, **#83 — Admin kontent moderatsiyasi** va **#159 — shaxsiy telefon maxfiyligi** bilan bog‘liq mavjud v128 jarayoni rivojlantirildi.
- Bu ish 185 ta talabning barchasini bajarish degani emas. Asl `docs/USTARA_185_NAZORAT.csv` **baytma-bayt o‘zgarmaydi**.

## Yetti tasdiqlangan kod yo‘nalishi

1. **Admin status filtri:** `GET /api/admin/profile-reports?status=pending|resolved|dismissed|all`, faqat allowlist. Parametr yo‘qligida avvalgi kabi `all` ishlaydi.
2. **Sahifalash:** `page=1..100`, serverda qat’iy `LIMIT 100 OFFSET $2`, sana+ID bo‘yicha deterministik saralash; bir varakay cheksiz ma’lumot yuklanmaydi. 100-sahifadan keyin arxiv/pagination strategiyasi keyingi bosqichda baholanadi.
3. **Maydonlar maxfiyligi:** DB adapter ortiqcha `reporter_user_id`, telefon yoki boshqa maxfiy maydonlarni qaytarsa ham API faqat ruxsat etilgan 9 ustunni chiqaradi; DB SQL SELECT ham shu maydonlarni tanlaydi.
4. **Admin interfeysi:** status tanlash, sahifa raqami, oldingi/keyingi tugmalar va bo‘sh natija xabari, kichik ekran uchun moslashgan controls.
5. **Admin token/tab race barrier:** avvalgi yuklash bekor qilinadi; token, tab, filter, page yoki request sequence eskirsa, javob ekranga yozilmaydi. Chiqishda pending request abort qilinadi.
6. **Profil almashishi:** mijoz bir profildan boshqasiga o‘tganda xato xabari formasi so‘rovni abort qiladi, ma’lumot va holatni tozalaydi; eski `finally` yangi so‘rov holatini buzmaydi.
7. **Review natijasi:** PATCH javobidagi `id` va `status` tasdiqlanadi; timeoutda PATCH avtomatik takrorlanmaydi, avval ro‘yxat refresh qilinadi. Faqat o‘sha admin panel contexti saqlanib qolsa refresh qilinadi. Yangi regressiya testlari qo‘shildi.

## Haqiqiy bajarilgan testlar
- Frontend Node unit: **1087/1087 PASS** (9 yangi test).
- Backend Node unit: **1373 PASS / 26 FAIL**, 0 SKIP (11 yangi PASS); 26 nom **v128 bilan aynan mos** — dependency yetishmovchiligi. `node --test` real Express/PG server sinovi emas.
- Changed JSX fayllar TypeScript JSX parser bilan parse tekshirildi: sintaksis xatosi yo‘q. Bu Vite production build o‘rnini bosmaydi.
- `npm view vite`: **EAI_AGAIN** DNS. `npm ci --offline` backend `xtend`, frontend `zod-validation-error`: **ENOTCACHED**. `npm run build`: **vite: not found**.
- `psql`, `postgres` yo‘q. PostgreSQL migratsiya, real DB tranzaksiyalari, browser/mobile va Telegram E2E: **NOT_RUN**.
- Oldingi 45 forward + 2 rollback va v128 dagi yangi 1 forward SQL o‘zgarmasligi ZIP auditida tekshiriladi; **yangi SQL migratsiya qo‘shilmadi**.

## Muhim cheklovlar va keyingi v130
- `page` 1–100 (har biri 100 ta); katta moderatsiya navbati uchun keyset pagination va alohida arxiv siyosati kerak bo‘lishi mumkin.
- 185 qaror reyestrida 130 ta `Tekshiruv kerak`, 46 ta `Qisman`, 9 ta boshqa holat bor. Original holatlar yangilanmadi.
- Real PostgreSQL sinovi uchun alohida `ustara_test_db` va cheklangan test roli; ishchi DBga migratsiya/test ishlatmang.
- Muassasadan/mahalliy internetdan npm dependency o‘rnatilgach, Vite build va keyin shikoyat API+admin UI E2E bajaring; so‘ng 185 qarorning keyingi funksional talabiga o‘ting.

**Production-ready: YO‘Q. Bu v129 arxivi tarixiy original v114 ZIPning baytma-bayt nusxasi emas.**
