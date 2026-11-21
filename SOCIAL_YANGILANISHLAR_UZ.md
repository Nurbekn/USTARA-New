# USTARA Social — 2.0 (2026-11-17)

## Yaxshilangan qismlar
- Social desktop lentasi va barberlarni kashf qilish yon paneli; mobil ekranlarga mos layout.
- Ko‘p rasmli postlarda oldingi/keyingi rasm tugmalari, aktiv slayd ko‘rsatkichi va rasm soni.
- Like sanog‘i server tasdiqlagandan so‘ng to‘g‘ri yangilanadi.
- Kuzatish tugmasi faqat customer hisoblarida chiqadi (backend customer-only talabiga mos).
- Izoh oynasi ochilganda `/api/social/posts/:id/comments` serverdan qayta o‘qiladi; eskirgan initial 30 comment bilan cheklanmaydi.
- Like/save/follow javoblarida server tasdiqlash qiymati tekshiriladi.
- Vizual: yumaloq kartalar, kategoriyalar uchun gorizontal chips, yangi post matni va like ko‘rsatkichi.

## Amalga oshirilgan testlar
- Frontend production build: PASS
- Frontend ESLint: PASS
- Social normalize/search regression: 4/4 PASS
- Existing frontend profile tests: 3/3 PASS
- Existing backend social route unit tests: 2/2 PASS

## Sinov chegarasi — MUHIM
Bu muhitda ishga tushirilgan haqiqiy PostgreSQL va so‘rovlarni qabul qiluvchi Telegram bot mavjud emas. Real end-to-end (login -> media yuklash -> post yaratish -> like/comment/follow -> booking) ishlashi **tasdiqlanmagan**. Integration testlarni staging serverda haqiqiy DB va test foydalanuvchilar bilan bajaring. Oldingi arxivning boshqa qismlari ham to‘liq production auditdan o‘tmagan.

## Staging sinov tartibi
1. Backend `.env` va PostgreSQL migratsiyalarini sozlang; `/api/health` 200 javob qaytarsin.
2. Tasdiqlangan barber bo‘lib tizimga kirib 2–6 ta rasmli post yarating. Lentada ko‘rinsin.
3. Customer sifatida kirib layk bosib yangilang: layk va sanog‘i saqlansin.
4. Izoh yozib sahifani qayta oching: izoh saqlangan bo‘lsin.
5. Barberga obuna bo‘ling va `Kuzatilgan` bo‘limiga o‘ting; post ko‘rinsin.
6. Postni saqlang va `Saqlangan` bo‘limida tekshiring.
7. Rasmli postni telefon ekranida gorizontal suring va indikatorlarni tekshiring.
8. Postdagi barber profiliga kirib bron qilish yo‘lini tekshiring.

## Productionga chiqarishdan oldin
Real DB testlari, media xotira hajmi / object storage strategiyasi, login va auth, moderatsiya, ko‘p foydalanuvchi stress testi, rate limit va server monitoringi talab qilinadi.
