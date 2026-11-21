# USTARA v171 — #109–#115 qarorlar

## Asl manba

- Asos: v170 ZIP, 1318 fayl.
- Manba reyestri: `docs/USTARA_185_NAZORAT.csv`, SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`. O'zgartirilmagan.
- Bu bosqichda 7 qaror **ko'rib chiqildi**. Qarorlar indeksining qamrovi **116/185**, qolgan **69**. Indekslangan degani amalga oshirilgan yoki production-ready degani emas.

## Yangi imkoniyat — #109

Barber profilida mavjud `bio` va tajriba qatoriga 5 tagacha **sartaroshning o'zi kiritadigan sertifikat** qo'shildi. Har bir yozuv: nom, bergan tashkilot, yil. Limit, uzunlik, dublikat va yil diapazoni serverda qayta tekshiriladi; `verified`, `evidenceUrl` kabi aldovchi maydonlar rad etiladi.

- `PUT /api/barbers/:id` orqali faqat o'zining sessiya/akkauntiga tegishli profil yangilanadi. Sertifikatlar JSONB parametr bilan saqlanadi; yuborilgan ro'yxat to'liq almashtiriladi.
- `GET /api/barbers/me` egaga, `GET /api/barbers/:id` faqat tasdiqlangan sartaroshning ommaviy profiliga qaytaradi. Telefon va private data oshkor qilinmaydi.
- Ommaviy profilda sertifikat **"o'zi kiritgan, USTARA tasdiqlamagan"** deb yoziladi; ilgari qo'shilgan, Admin tasdiqlagan badge tizimiga aloqasi yo'q.
- `20261225_barber_self_reported_certificates.sql` — **54-forward migratsiya**. Oldingi migratsiyalar o'zgartirilmagan. Bootstrap va verification reyestri yangilandi. **Haqiqiy DBga qo'llanmagan.** Schema va kodni bir release sifatida deploy qilish shart.

## Qolgan qarorlar holati

| # | Asl talab | Natija |
|---|---|---|
| 109 | Sartarosh About, tajriba, sertifikat | **Qisman**. Self-report sertifikatlar bor; dalil fayllari, verifikatsiya va browser/PG sinovlari yo'q. |
| 110 | Bir sartarosh uchun ko'p ish joyi | **Yo'q**. Har joy uchun vaqt, manzil, bronni alohida saqlash kerak. |
| 111 | Ko'p xodimli sartaroshxona tashkiloti | **Yo'q**. Salon tashkilot modeli, mulkchilik va a'zolik yo'q. |
| 112 | Egasi menejer sartarosh ruxsatlari | **Yo'q**. Tenant-scoped RBAC va ruxsatni qaytarib olish yo'q. |
| 113 | Mavjud akkauntni jamoaga taklif | **Yo'q**. Taklif-qabul qilish va muddat/kimlik tekshiruvi yo'q. |
| 114 | Xodimni jamoatdan xavfsiz chiqarish | **Yo'q**. Bronlarni saqlash va qayta biriktirish bilan a'zolikni bekor qilish yo'q. |
| 115 | Jamoa umumiy bron jadvali | **Yo'q**. Bir nechta xodim uchun ruxsat bilan umumiy ko'rish yo'q. |

Jamoaviy ruxsatlar va kalendarni mavjud bitta sartaroshli bronlar API'siga shunchaki aralashtirmaslik kerak: vakolat, foydalanuvchi chegarasi va o'tmishdagi bronlarni muhofaza qilish alohida dizayn talab qiladi.

## Test cheklovlari

- Frontend umumiy unit: **1662/1662 PASS**.
- Backend umumiy unit: **1627/1656 PASS**; 29 ta avvalgi muhitdagi `express`, `jsonwebtoken`, `bcrypt`, `pg` dependency yetishmovchiligi bilan bir xil. Hamma backend testlaridan muvaffaqiyatli o'tildi degani emas.
- Yangi audit, sertifikat va migratsiya maqsadli tekshiruvlari o'tdi. Source import graph — PASS, ammo Vite build emas.
- Haqiqiy PostgreSQL, parallel yozish, Chrome mobil E2E, Telegram, deployment va production credential tekshiruvi: **NOT RUN**.
- Bazaga, stagingga yoki productionga hech qanday migratsiya qo'llanmagan. **LOYIHA TUGADI emas.**
