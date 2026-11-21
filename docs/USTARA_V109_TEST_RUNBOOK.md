# USTARA v109 — lokal tekshirish tartibi

v108 ZIP’dan to‘liq davom etildi. Ishlatiladigan buyruqlar loyiha ildizida:

```bash
node backend/scripts/audit-phase1.js
node backend/scripts/v45-decision-integrity.js
(cd frontend && npm run test:v109:unit)
(cd frontend && npm run test:unit)
(cd backend && npm run test:v109:unit)
(cd backend && node --test test/*.unit.test.js)
```

**Muhim:** backenddagi 26 ta dependency xatosi (`express`, `pg` va boshqalar) avvalgi muhitdan qolgan. Ular production-ready emasligining bir sababidir. Vite build va haqiqiy browser testlari ham hali bajarilmagan.

### Real PostgreSQL tekshiruvlari (faqat izolyatsiyalangan lokal test baza)

1. Alohida `ustara_test_db` va `ustara_account_test` (superuser emas) yaratiladi va 45 migratsiya test bazasida amalda qo‘llanadi.
2. v108 read-only readiness skripti faqat maxsus `NODE_ENV=test`, `USTARA_V108_DAY_CLOSE_READINESS=I_AUTHORIZE_READ_ONLY_TEST` va `USTARA_TEST_DATABASE_URL` ruxsatlari bilan ishlaydi.
3. Bir vaqtda kelgan QR, walk-in, bron va kun yopilish tranzaksiyalarini haqiqiy PostgreSQL’da sinash zarur. **Ushbu versiyada real DB sinovi NOT_RUN**.
4. Testni production bazaga ulash, production parollarini ZIP ichiga qo‘shish yoki foydalanuvchi ma’lumotlarini nusxalash mumkin emas.

### Xavfsizlik regressiyalari

- Ish vaqtidan tashqari QR yaratish rad etiladi.
- QR chiqarish oldindan o‘tganidan keyin ish vaqti tugasa, oxirgi INSERT hech narsa yozmaydi.
- Noto‘g‘ri QR expiry yoki capacity/rate limit ma’lumoti bilan amal davom etmaydi.
- Qayta ochish tasdig‘i 30 soniyadan eski bo‘lsa, server rad etadi.
- Preview natijasida mahalliy sana va server vaqti mos kelmasligi rad etiladi.
- Preview `COMMIT` aloqasi uzilsa, o‘qish xatosi deb ko‘rsatiladi va ishonchsiz DB connection tashlanadi.
