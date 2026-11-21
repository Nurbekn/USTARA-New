# 185 qaror / v67 audit


1. `scripts/v67-decision-audit.cjs`: asl 185 savol-javob qarorlari CSV faylini to'liq o'qish, format, raqamlar, 10 bosqich va SHA-256 tekshiruvi.
2. Holatlarni yolg'on `DONE` ga aylantirmasdan aniq hisobot: 130 `Tekshiruv kerak`, 47 `Qisman`, 7 bekor/kechiktirilgan, 1 ochiq (#175).
3. `scripts/v67-migration-audit.cjs`: bootstrap ichidagi 42 forward SQL tartib/referenslari va 2 rollback yordamchi SQL butunligini o'zgartirmasdan tekshirish.
4. `backend/test/v67DecisionIntegrity.unit.test.js`: 7 regressiya testi, shu jumladan format xatolari, o'zgargan checksum va migratsiya bootstrapi.
5. v67 checkpoint, bosqichlar bo'yicha sonlar va aniq keyingi tekshirishlar qayd etildi.


## Holat
130 tekshiruv talab qiladi; 47 qisman; 7 bekor/kechiktirilgan; #175 ochiq. 0 tasi production E2E bilan tasdiqlangan deb daʼvo qilinmaydi.
