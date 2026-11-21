# USTARA — 1-bosqich: kod auditi va 185 qaror nazorati

**Asos:** `USTARA-Gemini-AutoBooking-v2.zip`. **Maqsad:** mavjud kodni saqlagan holda ishlab chiqishning keyingi bosqichlari uchun tekshiriladigan boshlang‘ich holat. **Holat:** strukturaviy audit bajarildi; platformaning barcha funksiyalarini E2E tekshirish hali tugallanmagan.

## Tekshirilgan komponentlar

- **Backend:** Node.js / Express 5, PostgreSQL (`pg`), JWT orqali akkaunt rolini tekshirish, mavjud bron controller va service kodlari, Telegram webhook/worker, Gemini post tavsifi yordamchisi.
- **Frontend:** React 19 / Vite 8, Customer, Barber va Admin yo‘llari, mobil layoutlar.
- **Database:** migratsiyalar ro‘yxati, bootstrap rejasining statik tekshiruvi. **Hech qanday SQL bajarilmadi.**
- **Testlar:** Backend `275/275` va frontend `114/114` unit test muvaffaqiyatli. Frontend build muvaffaqiyatli. Real API va DB integratsiya sinovlari bajarilmadi.

## Topilgan muhim farqlar va keyingi harakat

| Daraja | Kuzatilgan holat | Kelishilgan qaror | Keyingi ish | Bosqich |
| --- | --- | --- | --- | --- |
| Yuqori | `frontend/src/App.jsx` da Customer `/user/*` sahifalari `RequireSession` ichida; `backend/routes/social.js` GET feed uchun ham auth talab qiladi. | #107, #136 — mehmonlar ommaviy Ilhom, profillar va qidiruvni ko‘ra oladi. | Ommaviy, shaxsiy ma’lumotni chiqarmaydigan read-only API va guest UI; shaxsiy amallarga auth. | 6, 8 |
| Yuqori | `backend/database/migrations/` ichida shop/branch/team/manager jadvallari topilmadi, `backend/routes/`da shop boshqaruv routelari yo‘q. | #110–125, #148–149, #155, #175. | PostgreSQL migratsiyalari, huquqlar va owner transferni alohida modelga kiritish. | 7 |
| Yuqori | Smart Booking queue/QR/walk-in uchun asosiy jadval, xizmat va route’lar hozirgi migratsiya/routes ichida yo‘q. | #19–35, #126–129. | FIFO, QR so‘rov, barber tasdiq, taklif atomikligi va Telegram callback. | 4, 5 |
| Yuqori | `backend/controllers/bookingsController.js` va `backend/services/multiBooking.js`da xavfsiz auto-confirm yo‘li bor, lekin real PostgreSQL race testni shu auditda bajarmadik. | #52–53, #144, #169. | Real tranzaksiyalar, booking idempotency, snapshot va qayta urinish sinovi. | 3, 10 |
| O‘rta | `frontend/src/layouts/BarberLayout.jsx` pastki tablari: Bosh / Bronlar / Jadval / Ishlarim / Profil. | #61 — Asosiy / Bronlar / Navbat / Xizmatlar / Profil. | Navigatsiya, route va ekranlarni moslashtirish; mavjud Jadval/Portfolio imkoniyatlari yo‘qolmasin. | 6 |
| O‘rta | `frontend/src/layouts/UserLayout.jsx`: Bosh sahifa / Qidiruv / Bronlar / Ilhom / Profil. | #60 — Asosiy / Sartaroshlar / Ilhom / Bronlar / Profil. | UI yorliqlari va tartibini moslashtirish. | 6 |
| O‘rta | `backend/package.json`da `npm test` avval sinov emas, xatolik qaytaruvchi shablon edi; frontend `test:unit` faqat ikkita faylni qamragan. | Testlar orqali regressiyani kuzatish. | `npm test` ni barcha unit testlar uchun sozlash, statik audit buyrug‘ini qo‘shish. **Shu bosqichda tuzatildi.** | 1 |
| O‘rta | `backend/server.js`da `cors()` origin cheklovisiz; bu mustaqil zaiflik isboti emas, lekin ishlab chiqarishdagi origin siyosati aniqlashtirilishi kerak. | #84 va umumiy xavfsizlik. | Ishlab chiqarish uchun qat’iy ruxsat etilgan originlar, proksi va rate-limit konfiguratsiyasini tekshirish. | 2, 10 |
| O‘rta | Gemini post tavsifi endpointi mavjud. Tashqi API chaqiruvi kalitsiz tekshirilmagan; brauzer testlari haqiqiy provider bilan ishlatilmagan. | #40–41 va keyingi Gemini tanlovi. | Maxfiy server konfiguratsiyasi va haqiqiy API bilan ruxsatli smoke test. | 8, 10 |

## 185 ta qarorning nazorat fayli

`docs/USTARA_185_NAZORAT.csv` — 1–185 raqamli har bir qaror uchun **bitta qator**, asosiy mas’ul bosqich va ehtiyotkor tekshiruv holati. `Tekshiruv kerak` deb turgani “funksiya yo‘q” degani ham emas, “tayyor” degani ham emas: faqat shu auditda unga yetarli dalil to‘plangani yo‘q. Avvalgi suhbatda bekor qilingan yoki keyinga qoldirilgan funksiya alohida belgilangan. Statuslar keyingi bosqichda kod, test va integratsiya daliliga qarab yangilanadi.

## Amalda kiritilgan o‘zgarishlar

1. `backend/package.json`: `npm test`, `npm run test:unit`, `npm run audit:phase1` scriptlari.
2. `frontend/package.json`: `npm test` va barcha `test/*.test.js` fayllarini ishga tushiradigan `npm run test:unit`.
3. `backend/scripts/audit-phase1.js`: **faqat offline** loyiha fayllari, 185 qaror qatori va bootstrap migratsiyalar tartibini tekshiradi. Databasega ulanmaydi.
4. `backend/test/audit-phase1.unit.test.js`: 185 qaror va bootstrap rejasini offline tekshiruvchi test.
5. `docs/USTARA_185_NAZORAT.csv`, `docs/USTARA_10_BOSQICH_REJA.md` va ushbu hisobot.

## Sinovlar va cheklovlar

Yangi paketdagi scriptlar bilan **qayta ishlatiladigan** buyruqlar:

```bash
cd backend && npm test && npm run audit:phase1
cd ../frontend && npm test && npm run build
```

- Unit testlar — kod logikasi uchun tekshiruv, **prod DB yoki Telegram ishlashining isboti emas**.
- PostgreSQL migratsiyasi, bot tokeni, domen, haqiqiy Telegram yoki Gemini hisoblari **bu bosqichda ishlatilmadi**.
- Real DB’ga schema o‘zgartirish uchun alohida aniq ruxsat va zaxira kerak.
- 2-bosqichda eng avval akkaunt/huquq, OTP, JWT/CORS va schema xavfsizligini mustahkamlash; keyin 3-bosqichda bron yadrosi va parallel DB sinovlari.

**Yakuniy shart:** “185 ta bajarildi” deyish uchun har bir bekor qilinmagan qaror bo‘yicha kod dalili, tegishli test va real integratsiya tekshiruvi bo‘lishi kerak.
