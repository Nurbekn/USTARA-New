# USTARA v68 — #138 Akkauntdan chiqish xavfsizligi

Asos: v67 (807 fayl). Asosiy yo‘nalish: 185 qaror ichidagi #138 (akkauntlar o‘rtasida chiqish/kirish).

## Bajarilgan besh ish
1. Logout localStorage signali orqali bir origin'dagi boshqa ochiq tablarda sessiyani bekor qiladi; token signalga qo‘shilmaydi.
2. Logout paytida backend sessiyasi bilan birga eski local account metadata ham tozalanadi.
3. Eskirgan yoki mos kelmagan JWT/session juftligi aniqlanganda tabdagi credential va sessiya qiymatlari o‘chiriladi.
4. Storage cheklanganida logout boshqa kalitlarni tozalashni davom ettiradi; boshqa tabdagi logout qayta tarqatilmaydi.
5. 5 ta yangi regression test qo‘shildi va barcha frontend testlari qayta ishga tushirildi.

## Sinov va yaxlitlik
- frontend `node --test test/*.test.js`: **183/183 PASS** (shu jumladan v68: 5/5).
- `node --check` session.js: PASS.
- 185 qaror CSV hash: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — oldingi v67 bilan bir xil.
- 42 forward SQL va 2 rollback SQL o‘zgarmagan; jami 45 fayl checksum solishtirildi (CSV+SQL).
- Backend, haqiqiy PostgreSQL, Chrome, GitHub Actions, Telegram, real ko‘p-tabli browser E2E: **NOT_RUN**.

## Qolganlar
- #138 qat'iy to‘liq deb belgilangan emas: cross-device login/logout, server-side sessiya revoke va mobil E2E tasdiqlanishi kerak.
- 185 qaror dastlabki ro‘yxati va ularning statuslari o‘zgartirilmadi.
- Production-ready EMAS.
- Keyingi bosqich v69: #77 / #137 signup-role onboarding yoki #134 Privacy Center dastlabki funksional tekshiruvi, mavjud kodga mos implementatsiya va test.
