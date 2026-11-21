# USTARA v215 — PostgreSQL CI dalili: tasdiqlangan manzilga bog'lash

## 1. Tekshirilgan joylar
- `backend/scripts/v197-verify-evidence.cjs`: v212 descriptor orqali o'qish va v213 CI manbasini tekshirish.
- `backend/scripts/v214-anchored-evidence-write.cjs`: dalil faylini descriptor orqali yozish.
- `backend/test/v212ArtifactDescriptorSafety.unit.test.js`: oldingi descriptor testlari.
- `.github/workflows/v193-isolated-postgres-booking.yml`: faqat qo'lda ishga tushadigan, ajratilgan PostgreSQL 18 job.

## 2. Muammo
v214 yozish yo'lida katalog va fayl nomi qayta tekshirilardi. Verifier o'qish yo'lida esa tekshiruvdan keyin ochiq fayl descriptor'i eski inode'ga ulanganligicha qolishi mumkin edi: `artifacts` katalogi yoki JSON fayl nomi o'zgartirilganda verifier avvalgi, lekin endi tasdiqlangan manzilda mavjud bo'lmagan dalilni o'tkazishi mumkin edi.

## 3. O'zgarishlar
1. Verifier ochilgan katalog `dev/ino` qiymatini haqiqiy `artifacts` nomi bilan o'qishdan oldin va keyin solishtiradi.
2. Ochilgan faylning `dev/ino`, hajmi va `nlink` ko'rsatkichlari tasdiqlangan JSON fayl manzilidagi qiymatlarga mosligini tekshiradi.
3. Bir xil hajmli ichki tahrirlar uchun `mtimeNs` va `ctimeNs` o'zgarishi tekshiriladi.
4. Eski 2 ta v212 testi endi nom almashtirishni muvaffaqiyatsizlik sifatida kutadi.
5. v215 uchun 9 ta yangi offline regression-test qo'shildi.
6. GitHub Actions'da `npm run test:v215:unit` SQL bajarilishidan oldin ishlaydi; artifact nomi v215 ga yangilandi.

## 4. Haqiqiy tekshiruv natijalari
- `node --test` (v193–v215 tegishli testlari): **203/203 passed, 0 failed, 0 skipped**.
- `npm run test:v215:unit`: **9/9 passed**.
- `node --check` (o'zgartirilgan JS fayllar): **o'tdi**.
- `PyYAML` bilan GitHub Actions YAML sintaksisi va v215 test qadami SQL yaratilishidan oldin kelishi: **o'tdi**.
- Haqiqiy PostgreSQL 18: **bajarilmadi**. Mahalliy muhitda `psql`, PostgreSQL serveri va Docker mavjud emas. Shuningdek, `AGENTS.md` talabiga ko'ra SQL migratsiyalari yoki bazaga yozuvchi sinovlar uchun foydalanuvchining aniq ruxsati zarur.
- GitHub Actions workflow: **ishga tushirilmadi**; GitHub repozitoriysiga o'zgartirish yuborilmadi.

## 5. Cheklovlar va keyingi ish
Ushbu mexanizm lokal fayl nomlari/inode'larni qayta tekshiradi, ammo faol zararli jarayon uchun universal atomik yaxlitlik kafolati yoki kriptografik imzo emas. Real PostgreSQL 18 testlari disposable, foydalanuvchi ruxsat bergan muhitda alohida o'tkazilishi kerak. Production tayyorligi hozircha tasdiqlanmagan.

## Saqlangan holat
185 ta dastlabki qaror va ilovaning qolgan kodlari o'zgartirilmadi. Tarixiy DB migratsiyalari tahrirlanmadi.
