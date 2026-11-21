# USTARA v211 — CI dalil fayli katalogi xavfsizligi

Sana: 2026-11-21  
Asos: `USTARA-v210-Postgres-Process-Group-Containment.zip`

## Tekshirilgan qismlar

- `.github/workflows/v193-isolated-postgres-booking.yml` — manual CI,  PostgreSQL 18 service, oldindan va keyindan baza nazorati, dalil fayli tasdiqlanishi.
- `backend/scripts/v208-integration-exit-gate.cjs` — test subprocess va dalil fayli yaratilishidan oldingi shartlar.
- `backend/scripts/v196-integration-evidence.cjs` — TAP → JSON dalil fayli.
- `backend/scripts/v197-verify-evidence.cjs` — dalil faylini tasdiqlash.
- Mavjud `test:v210:unit` testlari va versiyaga bog'langan CI tekshiruvlari.

## Muammo

v210 da dalil faylining o'zi symlink bo'lishi tekshirilgan, lekin **`backend/artifacts` katalogi symlink bo'lsa**, tekshiruv tashqaridagi faylni kuzatishi yoki yozishi mumkin edi. Bundan tashqari, eski `v196` yordamchi CLI matnli TAP kirishini stdout ga qaytarar edi; TAP ichida maxfiy test ma'lumotlari bo'lishi mumkin.

## Bajarilgan ishlar

1. `backend/scripts/v211-artifact-directory-guard.cjs` qo'shildi: `artifacts` haqiqiy katalog bo'lishi, symlink bo'lmasligi, backend ishchi katalogidan tashqariga chiqmasligi talab qilinadi.
2. `v208` runner katalogni **subprocess ishga tushmasidan oldin** tekshiradi. Hali yo'q katalogga ruxsat beradi, lekin xavfli katalogda testni boshlamaydi.
3. `v196` dalil faylini yozishdan va `v197` uni o'qishdan oldin katalogni tasdiqlaydi. Avvaldan mavjud faylni almashtirmaslik (`wx`) talabi saqlandi.
4. `v196` eski CLI xom TAP baytlarini stdout ga nusxalashni to'xtatdi. Endi faqat qisqa statistik natijani chiqaradi.
5. `backend/test/v211ArtifactBoundary.unit.test.js` ga 11 ta offline regression-test qo'shildi: odatiy katalog, symlink katalog, symlink fayl, nomuvofiq fayl yo'li, nojoiz mavjud katalog, oldindan bloklash, CLI xom TAP maxfiyligi.
6. `test:v211:unit` npm skripti va GitHub Actions offline test qadami yangilandi. Eski versiya nomiga qat'iy bog'langan testlar yangi skript nomiga moslashtirildi; ularning xavfsizlik tekshiruvlari saqlandi.
7. Barcha tarixiy migratsiyalar, booking biznes-qoidalari, OTP va frontend fayllari o'zgartirilmadi.

## Sinovlar

- `cd backend && npm run test:v210:unit` (o'zgartirishdan oldin): **149/149 PASS**.
- `cd backend && node --test test/v211ArtifactBoundary.unit.test.js`: **11/11 PASS**.
- `cd backend && npm run test:v211:unit`: **160/160 PASS**, fail=0, skip=0.
- O'zgargan JavaScript fayllari: `node --check` bilan tekshirildi.
- GitHub Actions workflow: YAML parser bilan tekshirildi, trigger faqat `workflow_dispatch`.
- ZIP arxiv: yaratishdan keyin yaxlitlik tekshiruvi o'tkaziladi.

## Hali tasdiqlanmagan

- **Haqiqiy PostgreSQL 18 integratsiya sinovi BAJARILMADI.** Lokal muhitda `docker`, `postgres`, `psql` yo'q; foydalanuvchining real bazasiga ulanilmadi.
- GitHub Actions workflow ishga tushirilmadi va repozitoriyga push qilinmadi.
- Production, Telegram, brauzer E2E va deploy sinovlari bajarilmadi.

## Qolgan xavf / keyingi qadam

Bu tekshiruv oldindan mavjud symlink yo'naltirishini bloklaydi. Bir vaqtning o'zida katalog almashtirish (TOCTOU) kabi yuqori darajali mahalliy hujumlarni operatsion tizim sandboxi kabi mutlaq to'xtatmaydi. CI muhiti faqat ishonchli checkout va ajratilgan runnerda ishlashi kerak.

Keyingi ustuvor qadam: **foydalanuvchi roziligi bilan** v211 kodini GitHub'ga joylash, manual `workflow_dispatch` orqali PostgreSQL 18 integratsiya testini ishga tushirish va natijasini tekshirish. `LOYIHA TUGADI` holati berilmaydi.
