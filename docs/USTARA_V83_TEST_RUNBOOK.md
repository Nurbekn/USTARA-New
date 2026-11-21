# v83 — tekshiruv qo‘llanmasi

## Offline unit testlar (Node 22)
```bash
cd USTARA-New/frontend
npm run test:v83:unit
node --test test/*.test.js
node --check src/pages/user/barber/bookingDraft.js

cd ../backend
node scripts/audit-phase1.js
node scripts/v45-decision-integrity.js
```

## Real browser integratsiya (hali bajarilmagan)
1. `cd frontend && npm ci && npm run build` (muhitda `vite` mavjud bo‘lishi kerak).
2. Chrome, Android/iOS brauzerlarda: mehmon 2 xizmat + kun + vaqt tanlaydi, login/ro‘yxatdan o‘tadi; draft 5 daqiqa ichida tiklanadi, slot band qilinmaydi.
3. Bitta sartaroshda barcha xizmatlar olib tashlanadi; qayta kirganda eski draft tiklanmaydi.
4. Boshqa sartaroshga kirish birinchi sartaroshning draftini tozalamaydi; xizmat ro‘yxati o‘zgarsa draft tiklanmaydi.
5. Sana 14-kun chegarasidan chiqib qolsa yoki kun o‘zgarsa, eski sanani qaytarmaydi.
6. Xizmatlar 20 ta chegarasi; 21-xizmatni belgilashga yo‘l yo‘q.
7. Session storage taqiqlanganda xatolarsiz xizmatlarni ko‘rish mumkin.
8. Har bir tasdiqlashda serverdan narx, slot, davomiylik qayta tekshiriladi; takroriy bronlar server idempotency orqali himoyalanadi.

## Cheklovlar
v83 muhitida `npm run build` — `vite: not found`; haqiqiy DB, Chrome, Telegram, GitHub CI bajarilmagan. Bu bosqichda #98/#99 talablari **qisman**.
