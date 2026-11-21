# USTARA — latest checkpoint v156 (2026-11-20)

**Asos:** `USTARA-v155-185-Critical-Flow-Release-Evidence.zip` (1179 fayl). Asl 185 qaror CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`; 55 SQL saqlanadi.

## 7 bosqich

1. Yangi 7 qaror #1/#2/#3/#4/#7/#8/#9 asl CSV iboralari va source/test fayllarga bog‘landi.
2. Backend test minimal qamrovi — 161 fayl, 1501 muvaffaqiyatli TAP testi.
3. Frontend test minimal qamrovi — 114 fayl, 1609 muvaffaqiyatli TAP testi.
4. `npm test` va `test:unit` yozuvlari to‘liq test to‘plamiga mosligi tekshirildi.
5. Yolg‘on/to‘liq bo‘lmagan TAP, SKIP/TODO/FAIL, symlink va buzilgan plan rad etiladi.
6. GitHub Actions preinstall, posttest va reliz gate tekshiruvlari qo‘shildi.
7. Jami 23 ta yangi test, to‘liq regression va original reyestr/SQL auditi bajarildi.

## Qayd etilgan natijalar

- Frontend **1609/1609 PASS**.
- Backend unit **1498 PASS / 26 eski FAIL** (1524 test), 26 xato v155 bilan aynan bir xil.
- **23/23 yangi test PASS**. Source graph va QR preflight **source only PASS**.
- Jami **14/185 qaror** source/test manbasi bilan izlangan, **171 tasi hali bu auditda izlanmagan**; **0 tasi rasmiy production-verified**. Original reyestr 130 `Tekshiruv kerak`, 47 qisman, 7 kechiktirilgan, 1 noma’lum.
- `npm ci --offline` ENOTCACHED, npm ping EAI_AGAIN, Vite `not found`.
- PostgreSQL, Vite build, Chrome/mobile, Telegram real E2E **NOT RUN**. Production-ready **emas**.

**Dalil:** `docs/v156-full-unit-matrix-and-seven-source-traces.md`, `docs/v156-seven-ui-decisions-source-evidence.json`.

**Keyingi v157:** asl 185 qaror bo‘yicha dalillarni kengaytirish, CI da haqiqiy npm/PG/Vite/Chrome ishlatilganiga erishish. 185 talabning har biri bajarilib tasdiqlanmaguncha yakuniy deklaratsiya YO‘Q.
