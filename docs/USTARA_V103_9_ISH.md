# USTARA — so‘nggi checkpoint v103 (2026-11-20)

**Manba:** `USTARA-4-Bosqich-Cancellation-Alternatives-Integrity-v102.zip` (967 fayl). **4-bosqich**, production-ready **EMAS**.

## v103: #106 — xavfsiz bronni ko‘chirish, 9 yo‘nalishdagi yaxshilanish
1. Noto‘g‘ri (shu jumladan kalendarda mavjud bo‘lmagan) sanani API so‘rovidan oldin rad etish.
2. Slotlar ro‘yxati uchun 288 ta yuqori chegara, kutilgan `working`/`accepting_bookings` booleanlari, yopiq kunda soxta slotlarni rad etish.
3. Har bir slotning `start` va `end` vaqtlarini 5 daqiqalik grid bo‘yicha tekshirish; kun oxiridagi `24:00` faqat tugash vaqti sifatida mumkin.
4. Slotning davomiyligi server qaytargan booking davomiyligiga teng ekanini tekshirish, takrorlangan vaqtlarni rad etish.
5. Bo‘sh vaqtlarni xronologik tartiblash; server obyekti va arrayini o‘zgartirmaslik; ortiqcha, jumladan shaxsiy maydonlarni slotdan olib tashlash (fail-closed).
6. Xizmatlar o‘zgarsa narx faqat qat’iy `xxxx.xx` ko‘rinishidagi musbat server qiymati bo‘lsa ko‘rsatiladi; noaniq, nol yoki haddan tashqari katta miqdor rad etiladi.
7. Javobda brauzer sessiyasi o‘zgarmaganini va so‘rov abort qilinmaganini qayta tekshirish.
8. Faqat vaqt ko‘chirilganida server tasdiqida oldingi xizmat davomiyligi va mavjud tarixiy narx o‘zgarmaganini tekshirish.
9. `COMMIT` natijasi noaniq, akkaunt almashgan yoki boshqa qurilma o‘zgartirgan holatda ayni eskirgan UI’dan yana PATCH yuborishni bloklash; foydalanuvchiga ro‘yxatni yangilash amali berish.

## Sinov natijalari
- Frontend **816/816 PASS** (v102: 780, qo‘shilgan: 26 slot/receipt + 10 reconciliation testi).
- Tegishli backend `bookingModification.unit.test.js`: **15/15 PASS**.
- To‘liq backend: **1012 PASS / 26 FAIL**; mavjud npm paketlari (`express`, `pg`, `bcrypt`, `jsonwebtoken` va boshqalar) yo‘qligi sababli.
- JSX: TypeScript transpile parser diagnostikasi **0**. JS `node --check`: PASS.
- `audit-phase1.js`: PASS; `v45-decision-integrity.js`: PASS.
- 185 qarorning SHA-256 qiymati: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` (o‘zgarmagan).
- **44** forward migratsiya (o‘zgarmagan).
- Vite build, real PostgreSQL, brauzer E2E, Telegram va GitHub CI: **NOT_RUN**.

## Cheklovlar
- #106 hali **qisman bajarilgan**: staging PostgreSQL va haqiqiy brauzer sinovlari yo‘q.
- Vaqt slotlari maslahat sifatida beriladi; server PATCH tranzaksiyasida bandlik, narx va jadvalni qayta tekshirishi majburiy.
- Keyingi v104: integratsiya muhitini tayyorlash, bron ko‘chirish tranzaksiyasini haqiqiy DB bilan tekshirish va keyingi qisman qarorni tuzatish.
