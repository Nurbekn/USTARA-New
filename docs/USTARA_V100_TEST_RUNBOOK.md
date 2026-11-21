# USTARA v100 — test qo‘llanmasi

Loyiha ildizida:

```bash
node --test frontend/test/v100ServiceFinishConfirmation.test.js
npm --prefix frontend run test:v100:unit
node --test frontend/test/*.test.js
node --test backend/test/*.unit.test.js
node backend/scripts/audit-phase1.js
node backend/scripts/v45-decision-integrity.js
node scripts/v67-migration-audit.cjs
```

Production ishga tushirishdan oldin izolatsiyalangan muhitda `npm ci` orqali mavjud package-lock bog‘liqliklari o‘rnatilishi, `npm run build` va haqiqiy mobil brauzer E2E bajarilishi kerak.

## Brauzer E2E (hali bajarilmagan)
1. Sartarosh `in_service` holatidagi mijozning «Xizmat tugadi» tugmasini bosadi — server so‘rovi ketmaydi, Ha/Yo‘q chiqadi.
2. «Yo‘q» — hech qanday status o‘zgarmaydi.
3. «Ha» — faqat bir PATCH, `expected_status: in_service`; server `served` qaytargach faol navbatdan chiqadi.
4. Tasdiq ochiq holda boshqa qurilmadan served/left bo‘lsa, refresh tasdiqni yopadi.
5. Tasdiq ochiq holda akkaunt almashtirilsa yoki 30 soniya o‘tsa, eski tasdiq bloklanadi.
6. Internet xatosida «Amal natijasi noaniq» xabari; eski muvaffaqiyat ko‘rsatilmaydi.
7. Oldingi kundan qolgan navbatda ishlamaydigan «Yakunlash» tugmasi ko‘rsatilmaydi.

Bu testlar bajarilmaguncha #157 production uchun yopiq deb belgilanmaydi.
