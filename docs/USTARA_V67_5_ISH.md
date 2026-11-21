# USTARA v67 — 185 qaror monitoringi va migratsiya yaxlitligi

**Asos:** v66 arxivdagi 802 fayl. Asl kod saqlangan. Ishlar faqat offline audit va testlarni mustahkamlaydi.

## Bajarilgan besh ish
1. `scripts/v67-decision-audit.cjs`: asl 185 savol-javob qarorlari CSV faylini to'liq o'qish, format, raqamlar, 10 bosqich va SHA-256 tekshiruvi.
2. Holatlarni yolg'on `DONE` ga aylantirmasdan aniq hisobot: 130 `Tekshiruv kerak`, 47 `Qisman`, 7 bekor/kechiktirilgan, 1 ochiq (#175).
3. `scripts/v67-migration-audit.cjs`: bootstrap ichidagi 42 forward SQL tartib/referenslari va 2 rollback yordamchi SQL butunligini o'zgartirmasdan tekshirish.
4. `backend/test/v67DecisionIntegrity.unit.test.js`: 7 regressiya testi, shu jumladan format xatolari, o'zgargan checksum va migratsiya bootstrapi.
5. v67 checkpoint, bosqichlar bo'yicha sonlar va aniq keyingi tekshirishlar qayd etildi.

## Sinovlar
- v67 7/7 PASS; oldingi v66 12/12 PASS.
- `audit-phase1.js`: 185 indexed / 42 forward migrations; PASS (offline).
- `v45-decision-integrity.js`: immutable CSV PASS (offline).
- Original 185 CSV **o'zgartirilmadi**, SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`.
- PostgreSQL haqiqiy serveri, GitHub Actions, production Chrome, Telegram va mobil E2E hali NOT_RUN/BLOCKED. v67 ishlab chiqish testlari 185 ta talab bajarilganini anglatmaydi; production-ready EMAS.

## Asosiy navbat
- 185 talabni bosqichlar kesimida to'liq yakunlash: 2-bosqich 9, 3-bosqich 33, 4-bosqich 30, 5-bosqich 4, 6-bosqich 47, 7-bosqich 21, 8-bosqich 17, 9-bosqich 21, 10-bosqich 3.
- Keyingi ishlarda funksiyaning o'zini tuzatish, server/integratsiya sinovlari, keyin statusni dalil bilan yangilash. #175 ochiq qolgan, tekshiruvsiz yopilmaydi.
