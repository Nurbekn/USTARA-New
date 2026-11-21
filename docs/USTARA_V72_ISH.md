# USTARA v72 — Barber setup data integrity

## Bajarildi
1. Ish jadvalida 7 kun, unikallik, kun indeksi, boolean isOff holatini tekshirish.
2. Ish kunlarining 24 soatlik HH:MM format va start < end tartibini tekshirish, kamida bir ish kuni.
3. Profil setup manzili, 500 belgilik limit, geokoordinatalar va manzil/nuqta mosligini tekshirish.
4. Serverdagi ish jadvali (takroriy kun, yomon vaqt, teskari vaqt) va joylashuvni tekshirish; akkaunt almashganda yuklashni rad etish.
5. Saqlash natijasida server qaytargan ish jadvali so‘ralgan jadvalga mosligini tekshirish; sessiya o‘zgarganda setupDone yozmaslik.
6. UI saqlashdan oldin xatolarni ko‘rsatadi; manzil maydonidagi xatoni tozalaydi.
7. 19 yangi v72 test va mavjud 6 barber setup testlari; frontend jami 244/244 PASS.

## Saqlangan
- 185 ta qaror CSV sha256 bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71.
- 42 forward, 2 rollback SQL: offline audit PASS; SQL fayllari o‘zgarmagan.
- Eski arxivdagi 817 ta fayl mavjud.

## Cheklovlar
- GitHub CI, haqiqiy PostgreSQL, Chrome, Telegram va mobil E2E bajarilmadi.
- #14 (tasdiqlangan manzil va xarita) hamda #15 (profil) hali to‘liq yopilmadi.
- Production-ready emas.
