# USTARA v212 — PostgreSQL CI dalil faylini xavfsiz o‘qish

Sana: 2026-11-21  
Asos: `USTARA-v211-CI-Artifact-Directory-Boundary.zip`

## Tekshirilgan qismlar

- `.github/workflows/v193-isolated-postgres-booking.yml`: faqat qo‘lda ishga tushadigan PostgreSQL 18 CI, TAP dalili va yuklash tartibi.
- `backend/scripts/v197-verify-evidence.cjs`: dalil faylini o‘qish va JSON sxemasini tekshirish.
- `backend/scripts/v211-artifact-directory-guard.cjs`: katalog uchun symlink nazorati.
- `backend/scripts/v196-integration-evidence.cjs`: yangi dalil faylini `wx` bayrog‘i bilan yaratish.
- Mavjud `test:v211:unit` regression-testlari.

## Aniqlangan zaiflik

Oldingi verifier `lstatSync(filename)` bilan faylni tekshirganidan keyin `readFileSync(filename)` orqali uni **nomidan qayta ochardi**. Oraliqda fayl yoki katalog nomi almashtirilsa, keyingi o‘qish avval tekshirilgan inode’ga tegishli bo‘lmasligi mumkin edi (TOCTOU). `lstat` tekshiruvi hardlink va FIFO holatlarini ham to‘liq qamrab olmagan.

## Bajarilgan o‘zgarishlar

1. `v197-verify-evidence.cjs` endi katalog va faylni alohida descriptor bilan ochadi; Linux’da `/proc/self/fd/<dirfd>` orqali faylni **oldindan ochilgan katalogga** bog‘laydi.
2. `O_NOFOLLOW` yordamida fayl oxiridagi symlink’lar, `O_DIRECTORY` yordamida katalog nomuvofiqligi rad etiladi.
3. `O_NONBLOCK` bilan FIFO maxsus faylini ochishda osilib qolish xavfi kamaytirildi; `fstat` bilan faqat oddiy fayl va `nlink===1` qabul qilinadi.
4. Fayl hajmi 100–4096 bayt bo‘lishi shart. O‘qish hajmi ham 4097 bayt bilan cheklangan; o‘qish davomida fayl hajmi o‘zgarsa dalil rad etiladi.
5. `finally` ichida ochilgan descriptorlar yopiladi; CI loglariga xom dalil yoki maxfiy TAP chiqmaydi.
6. `backend/test/v212ArtifactDescriptorSafety.unit.test.js` ga **10 ta offline regression-test** qo‘shildi. Ular normal dalil, symlink, hardlink, FIFO, katalogni fayl o‘rnida berish, hajm chegarasi, fayl/katalog nomini almashtirish, CI attempt mosligi va o‘qish vaqtida faylni uzaytirishni sinaydi.
7. `backend/package.json` ga `test:v212:unit` skripti qo‘shildi; GitHub Actions offline test qadami v212 bilan yangilandi. Eski `test:v211:unit` o‘chirilmadi.
8. Tarixiy migratsiyalar, booking xizmatlari, frontend, OTP va admin oqimlari o‘zgartirilmagan.

## Haqiqatan bajarilgan tekshiruvlar

- O‘zgartirishdan avval: `npm run test:v211:unit` — **160/160 PASS**.
- O‘zgartirishdan keyin: `npm run test:v212:unit` — **170/170 PASS**, fail=0, skipped=0.
- JavaScript sintaksisi va CI YAML konfiguratsiyasi alohida tekshiriladi.
- Yakuniy ZIP yaxlitligi alohida tekshiriladi.

## Chegaralar va keyingi ish

- **PostgreSQL 18 bilan haqiqiy integratsiya testi bajarilmadi**: ushbu muhitda `postgres` va `docker` yo‘q. Lokal testlar faqat offline unit/regression-testlardir.
- GitHub Actions workflow ishga tushirilmadi, repozitoriyga kod push qilinmadi.
- Linux’dagi descriptor-anchoring bilan katalog nomi almashtirilishi nazorat qilindi; boshqa platformalarda bir xil TOCTOU kafolati yo‘q. Bir xil inode’ga yozish huquqiga ega mahalliy jarayonning ayni paytda **bir xil hajmdagi** ma’lumotni o‘zgartirishiga qarshi mutlaq kafolat berilmaydi.
- Bu JSON dalil **kriptografik autentifikatsiya yoki production tayyorligi isboti emas**; u hali ham ishonchli, ajratilgan CI runner va real bazada o‘tkaziladigan testga tayanadi.
- Keyingi ustuvor vazifa: foydalanuvchining aniq roziligi bilan GitHub’ga joylash va manual PostgreSQL 18 integratsiya workflow’ni ishga tushirib natijani tekshirish.

**LOYIHA TUGADI deb belgilanmaydi.**
