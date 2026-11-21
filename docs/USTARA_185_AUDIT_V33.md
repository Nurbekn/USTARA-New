# USTARA — 185 ta kelishilgan qaror: v33 nazorat hisoboti

**Holat:** 2026-11-18. **Manba:** `docs/USTARA_185_NAZORAT.csv`.

Bu faylda 185 ta avvalgi kelishuvni qayta savol bermasdan davom ettirish uchun joriy holat ko‘rsatiladi. **Ro‘yxatda bo‘lish = funksiya to‘liq bajarilgan yoki production sinovdan o‘tgan degani emas.** Har bir qarorning asl matni, bosqichi, holati va dalili CSV reyestrida saqlanadi. Bu hisobot har bir xususiyatning haqiqiy E2E holatini sertifikatlamaydi.

## Joriy hisob

| Holat | Soni |
| --- | ---: |
| Tekshiruv kerak | 131 |
| Qisman bajarilgan (unit/kod dalili mavjud bo‘lishi mumkin) | 46 |
| Bekor yoki keyinga qoldirilgan | 7 |
| Ochiq / aniqlik yetishmaydi | 1 |
| **Jami** | **185** |

`fully_verified` soni bu reyestrdan **aniqlanmaydi**; uni 0 yoki 185 deb e'lon qilish noto‘g‘ri.

## Ochiq nomuvofiqlik

- **#175 — Sartaroshxona yopilganda butunlay o‘chirish.** Hozirgi backendda alohida `shop` modeli aniqlanmagan. Hozirgi kodda bu funksiyani sun'iy tarzda 'bajarildi' deb belgilash mumkin emas. Avval domen modeli va ma'lumotlarni saqlash/yo‘q qilish qoidalari aniqlanishi kerak; foydalanuvchining avvalgi qarori o‘zgartirilmasin.

## v33 da tekshirilgan #60

- **#60 — Mijoz navigatsiyasi**: `Asosiy → Sartaroshlar → Ilhom → Bronlar → Profil` tartibi `frontend/src/layouts/UserLayout.jsx`da moslandi; `frontend/test/customerNavigation.test.js` avtomatik tekshiradi. Mobil E2E hali bajarilmagani sabab holat **qisman**.

## Bosqichlar bo‘yicha sonlar

| Asosiy bosqich | Tekshiruv | Qisman | Bekor/keyinga | Ochiq | Jami |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2 | 5 | 4 | 0 | 0 | 9 |
| 3 | 12 | 18 | 3 | 0 | 33 |
| 4 | 12 | 18 | 0 | 0 | 30 |
| 5 | 4 | 0 | 0 | 0 | 4 |
| 6 | 39 | 6 | 2 | 0 | 47 |
| 7 | 18 | 0 | 2 | 1 | 21 |
| 8 | 17 | 0 | 0 | 0 | 17 |
| 9 | 21 | 0 | 0 | 0 | 21 |
| 10 | 3 | 0 | 0 | 0 | 3 |

## Keyingi nazorat usuli

1. `cd backend && npm run audit:decisions` — 185 satr, raqam va mavjud status sinflari tekshiriladi; faqat o‘qiydi.
2. `cd backend && node --test test/decisionCoverage.unit.test.js` — dublikat, yo‘qolgan va bo‘sh qarorlar aniqlanadi.
3. Yangi versiyada faqat tegishli qaror qatorining `holat` va `dalil_yoki_izoh` maydonini haqiqiy test dalili bilan yangilang; eski javob matnini taxmin qilib qayta yozmang.
4. **Tekshiruv kerak** satrlarni 'bajarilgan' deb avtomatik hisoblamang. Real PostgreSQL, Telegram va mobil E2E alohida audit talab qiladi.
