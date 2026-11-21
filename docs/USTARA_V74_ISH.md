# USTARA — so‘nggi checkpoint v74 (2026-11-19)

**Asos:** v73 — 822 fayl. Maqsad: #162 service-edit/katalog va bron narxini aniq saqlash talablarini mustahkamlash.

## Bajarilgan yaxshilanishlar
1. Public xizmatlar katalogida ID faqat canonical musbat INTEGER bo‘lishi.
2. PostgreSQL INT32 oralig‘idan tashqari ID lar rad etilishi.
3. `1e3`, `01`, `+1`, bo‘shliqli va kasrli ID lar rad etilishi.
4. Sartaroshning authenticated xizmatlar ro‘yxati ID tekshiruvi bilan moslashtirildi.
5. Yakka xizmat o‘qishida owner yoki approved+active+non-deactivated shartlari SQL da tekshiriladi.
6. Inactive yoki o‘chirilgan sartarosh katalogidan ma’lumot chiqmasligi shartlari qo‘shildi.
7. Xizmatning bir dona API javobida faqat kerakli ustunlar chiqariladi.
8. Egasi o‘zining inactive xizmati holatini ko‘ra oladi.
9. API o‘qish javobi cache qilinmasligi uchun no-store.
10. Update va delete ID lariga bir xil qat’iy tekshiruv.
11. Bron xizmatlari narxi PostgreSQL NUMERIC satridan tiyin aniqligida hisoblanadi.
12. Eksponent, Infinity, manfiy, nol va 2 dan ortiq kasr xonali DB narxlari rad etiladi.
13. Tanlangan xizmatlar tartibi va tranzaksiyadagi server narx nazorati o‘zgarmadi.
14. 37 ta yangi backend regressiya testi qo‘shildi.

## Testlar
- v74 yangi testlar: **37/37 PASS**.
- Narx, service endpoint va katalog bo‘yicha tanlangan testlar: **61/61 PASS**.
- Frontend Node testlar: **264/264 PASS**.
- To‘liq backend unit suite: **571 PASS / 26 FAIL**. 26 ta xatolik npm dependency MODULE_NOT_FOUND muhit cheklovi bilan bog‘liq (production PASS emas).
- 185 ta qaror CSV asl SHA-256 **bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71** (o‘zgarmagan).
- 42 forward migratsiya + 2 rollback yordamchi SQL: o‘zgarmagan, **offline**.
- Haqiqiy PostgreSQL, Telegram, Chrome va production build: **NOT_RUN**. Production-ready emas.

## Keyingi bosqich
v75: backend katalogi va UI validatsiya mosligi; narx yangilangan va o‘chirilgan xizmatlar uchun bron tarixini qat’iy tekshirish, DB integration testlariga o'tish.
