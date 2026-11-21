# USTARA v128 — profil ma’lumotidagi xatolar haqida xabar (#178, #49, #83)

2026-11-20. Bu hujjat **kod va izolyatsiyalangan testlar** dalili; real PostgreSQL o‘rnatilganini yoki production tayyorligini tasdiqlamaydi.

## Yetti tekshirilgan o‘zgarish

1. `database/migrations/20261217_profile_issue_reports.sql`: yangi, **46-chi forward** migratsiya. 45 ta eski forward va 2 rollback SQL **o‘zgarmagan**. Jadval: yuboruvchi, profil, sabab, tafsilot, status, kim/qachon ko‘rib chiqqani. `pending` xabarlar uchun bitta mijoz/profil/sabab bo‘yicha qisman `UNIQUE` indeks.
2. `POST /api/barbers/:id/profile-report` faqat tasdiqlangan sartarosh va **autentifikatsiyalangan customer** uchun; sabablar allowlist, tafsilot 10–500 belgi. Hujjatlar yoki parollarni yubormaslik UI’da eslatiladi.
3. Takroriy ochiq xabar 409, yo‘q profil 404, noto‘g‘ri forma 400, server xatosi 503; hech qachon avtomatik profil o‘zgartirilmaydi yoki shikoyatchining telefoni qaytarilmaydi.
4. Admin `GET /api/admin/profile-reports` oxirgi 100 ta xabarni ko‘radi (telefon va reporter IDsiz), yangi xabarlar oldinda. Har bir so‘rov auth + adminOnly orqali o‘tadi.
5. Admin `PATCH /api/admin/profile-reports/:id` bilan faqat `pending` holatini `resolved` yoki `dismissed` ga o‘zgartiradi. Faqat birinchi tasdiqlangan o‘zgarish qabul qilinadi; moderator ID va vaqt DBga yoziladi.
6. Ommaviy profilda mijozga ochiladigan xato xabari formasi; bekor qilish, xato sababi, login talabi, submit paytida tugmani bloklash, session almashsa eski javobni bekor qilish.
7. Admin panelda alohida **Profil xatolari** bo‘limi; 22 ta yangi backend/frontend testi; oldingi migratsiya soni haqidagi tekshiruvlar 45→46 ga moslashtirildi, fail-closed nazoratlar saqlandi.

## Haqiqiy test holati

- `frontend/node --test test/*.test.js`: **1078 PASS / 0 FAIL / 0 SKIP**.
- `backend/node --test test/*.unit.test.js`: **1362 PASS / 26 FAIL / 0 SKIP**. Qolgan 26 FAIL v127’dagi aynan o‘sha dependency xatolari. Yangi 12 backend / 10 frontend test PASS.
- Frontend o‘zgargan JSX fayllari TypeScript JSX sintaksis parserida **0 parse xato**.
- `npm ci --offline`: backend `xtend` ENOTCACHED, frontend `zod-validation-error` ENOTCACHED.
- `npm run build`: **FAIL** — `vite: not found`.
- Haqiqiy PostgreSQL migratsiya/integratsiyasi, browser/mobile/Telegram E2E: **NOT_RUN**.

## Deploy / xavfsizlik

- Yangi API ishlashi uchun eski migratsiyalardan keyin 46-chi migratsiya **izolyatsiyalangan PostgreSQL test bazada** tatbiq etilib tekshirilishi shart. Birorta production DB bu bosqichda o‘zgartirilmadi.
- Eski 185 qaror CSV (`bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`) o‘zgarmagan; 45+2 tarixiy SQL ham o‘zgarmagan.
- Chiqish holati: **NOT PRODUCTION READY**. Qo‘shimcha 46-chi migratsiya uchun real SQL sinovi qolgan.
