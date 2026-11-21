# USTARA — 185 qaror holati (v35)

**Manba:** `docs/USTARA_185_NAZORAT.csv`. Mijoz bilan kelishilgan 185 qaror saqlandi; mazmuni, tartibi, holati va dalil ustunlaridagi matnlar v34 dan **o'zgartirilmadi**.

| Holat | Soni |
|---|---:|
| Tekshiruv kerak | 131 |
| Qisman | 46 |
| Bekor yoki keyinga qoldirilgan | 7 |
| Ochiq nomuvofiqlik: #175 | 1 |
| **Jami** | **185** |

v35 qo'shimcha amalga oshirish dalillari (CSV holatlarini oshirmaydi):
- **#135**: account pause va manual navbatni ko'rishda active account identity lock; barber Smart Booking takliflarini bekor qilishda user_id/profil haqiqiyligi transactionda tekshiriladi. 8 yangi mock unit test; **real DB hali SKIP**.
- **#127**: `accepted` taklifning kechikkan qabul replay holatida `410 confirmation_expired`; oldindan tasdiqlangan bron saqlanadi. Telegram sinovi hali bajarilmagan.
- **#175**: sartaroshxona yopilganda ma'lumotlarni butunlay o'chirish uchun shop modeli va o'chirish siyosati aniqlanmagan; ochiq qoladi.

`npm run audit:decisions` / `node backend/scripts/audit-phase1.js` ro'yxat yaxlitligini tekshiradi, ammo barcha qarorlar tayyor yoki productionda tasdiqlanganini anglatmaydi.
