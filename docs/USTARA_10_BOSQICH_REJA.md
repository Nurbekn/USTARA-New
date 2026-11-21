# USTARA — 185 qaror uchun 10 bosqichli amalga oshirish rejasi

**Manba:** 1–185 savollardagi oxirgi tanlovlar; bekor qilingan fikrlar qayta kiritilmaydi. Har bir qarorning mas’ul bosqichi `USTARA_185_NAZORAT.csv` faylida ko‘rsatilgan. Ishni tayyor USTARA kodidan davom ettiramiz.

## 1. Kod auditi va qarorlarni kuzatish — bajarildi (strukturaviy audit)

- Mavjud frontend/backend/Telegram/Gemini kod tuzilmasini ko‘rish.
- 185 qaror inventari, takrorlangan yoki bekor qilingan qarorlarni ajratish.
- Unit testlar va frontend build, offline migration-check; topilgan bo‘shliqlar hisoboti.
- Chegara: **real DB, Telegram, brauzer E2E va barcha 185 funksiya sinovlari hali bajarilmadi**.

## 2. Akkauntlar, database va xavfsizlik — qisman kodlandi (real integratsiya qolgan)

- Bitta telefon raqami = bitta akkaunt; mijoz va sartarosh akkauntlari alohida.
- Telegram OTP, telefon o‘zgartirish, parol va akkaunt tiklashni end-to-end tekshirish.
- JWT rol va vakolatlar, CORS, rate-limit, audit log, faol sessiyalar, xavfsiz admin. **CORS allowlist va sessiyani bekor qilish qismi 2-bosqichda kodlandi; qolganlari `USTARA_PROGRESS.md`da.**
- Kelishilgan funksiyalarga kerakli yangi PostgreSQL migratsiyalarini **oldingi tarixiy migratsiyalarni tahrirlamasdan** yaratish.
- Qabul sharti: xavfsizlik testlari, bo‘sh test DB bootstrap, login va tiklash integratsiyasi o‘tgan.

## 3. Bron yadrosi

- 5 daqiqalik slotlar va davomiylik; xizmatlar, snapshot narx va vaqt.
- Avtomatik tasdiqlash, bitta slotda bitta bron, mijozdagi vaqt to‘qnashuvini taqiqlash.
- Booking idempotency, internet uzilganda tekshiruv, bron o‘zgartirish, bekor qilish, qayta bron.
- Sartaroshning telefon orqali bron qo‘shishi; buyurtma va xizmatlar faqat foydalanuvchi tasdig‘i bilan o‘zgaradi.
- Qabul sharti: haqiqiy PostgreSQL bilan parallel bron testlari va rolga oid integratsiya sinovlari o‘tgan.

## 4. Smart Booking va navbat

- Walk-in FIFO, QR, sartarosh tasdiqlaydigan navbat, real-time ETA.
- Walk-in uchun ustuvorlik, bo‘shagan vaqt taklifi (5 daqiqa), Telegram javoblari atomikligi.
- Keldi/Boshladi/Tugadi, No-show tasdiqlash, offline xavfsiz amallar, manbalarga muvofiq audit.
- Qabul sharti: ikki foydalanuvchi bir vaqtda harakat qilganda navbat va bron izchilligi saqlanadi.

## 5. Telegram bot

- Bosh menyu, OTP, yangi telefonni tekshirish, bron xabarlari, eslatmalar.
- 5 daqiqalik taklif tugmalari, navbat chaqiruvlari; qayta urinish/outbox, duplicate event himoyasi.
- Maxfiy xabarlar, vakolat nazorati, foydalanuvchi tili.
- Qabul sharti: ruxsatli Telegram bot bilan barcha muhim oqimlar real sinovdan o‘tgan.

## 6. Customer va Barber dizayni

- Kelishilgan beshtadan tab; guest read-only; qidiruv, profil, xarita, bron ekranlari.
- Barber dashboard, inbox, timeline, ish jadvali, xizmatlar va private note.
- Mobile-first, accessibility, offline indikatorlar, yuklanish/xato/retry.
- Qabul sharti: mobil va desktop brauzer testlari hamda roldan rolga o‘tish xavfsizligi.

## 7. Sartaroshxona va jamoa

- Verified shop, egasi/menejer/xodim huquqlari, taklifnomalar va ownership transfer.
- Bitta ish joyi default, optional filial; umumiy katalog, jadval, galereya va statistikalar.
- Sartaroshxona yopilishida vakolatli o‘chirish; xodimning shaxsiy akkaunti saqlanadi.
- Qabul sharti: oddiy barber va ko‘p-xodimli shop uchun mustaqil testlar o‘tgan.

## 8. Ilhom, chat va Gemini

- Post, video, portfolio, komment/reaction/save, kolleksiyalar, report/moderatsiya.
- Shaxsiy chat, oqilona bildirishnomalar; Gemini orqali *faqat yordamchi* post tavsiflari.
- Kalitlar serverda; AI booking/OTP/huquqlarni hal qilmaydi.
- Qabul sharti: media xavfsizligi, upload limitlar, auth va Gemini failover sinovlari o‘tgan.

## 9. Admin Control Center

- Foydalanuvchi/barber tasdiqlash, shop verifikatsiyasi, shikoyatlar va apellyatsiya.
- Monitoring, bron/queue nazorati, promo va badge boshqaruvi, audit va xavfsizlik sozlamalari.
- Qabul sharti: har bir Admin amali ruxsat tekshiruvi va audit tarixiga ega.

## 10. Integratsion testlar va foydalanishga tayyorlash

- Frontend+backend+PostgreSQL+Telegram birgalikda test.
- Performance, parallel so‘rovlar, ilova monitoringi, xavfsizlik tekshiruvlari.
- Fayl yuklash, backup/restore, bosqichli chiqarish, rollback va deployment.
- Qabul sharti: `USTARA_185_NAZORAT.csv` da bekor qilinmagan har bir qaror uchun dalil, test va qabul holati qayd etilgan.

## Asosiy qoida

Vaqt/sana taxmini kodga kiritilmagan. Har bir bosqich **real natija va sinov dalili bilan** tugallanadi; kalitlar, bot tokenlari va parollar repo/ZIP ichiga kiritilmaydi. Oldingi bosqichdagi tekshirilgan funksiyalarni buzmaslik majburiy.
