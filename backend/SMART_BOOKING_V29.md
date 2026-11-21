# USTARA v29 — QR ishlatmaydigan walk-in mijoz uchun ixtiyoriy Smart Booking

**Status: development / production-ready EMAS.** Asos: v28 ZIP. Bu kod production bazasiga migratsiya qo‘llamaydi; haqiqiy PostgreSQL/Telegram va mobil E2E sinovlari hozircha BAJARILMAGAN. OTP ekranining 1:00 taymeri, Admin QR TTL 1–120 daqiqa, QR oqimi va v28 multi-service bronini o‘zgartirmaydi.

## V29 nimani qo‘shadi

1. **Faqat barber tashabbusi:** tasdiqlangan sartarosh `POST /api/queue/walk-ins/:id/claim-code` (Bearer JWT) orqali **oddiy, bugungi va waiting** ticket uchun 128-bit (`32 hex`) bir martalik kod yaratadi. Mavjud QR ticketga kod berilmaydi. Kod 15 daqiqalik; avvalgi kodni yangisi bekor qiladi; ketma-ket 60 sekund ichidagi qayta yaratish cheklanadi. Javobdagi raw kod server logiga yoki DBga yozilmaydi. Uni faqat ticket egasiga ko‘rsating. Bitta foydalanuvchiga noto‘g‘ri kod uzatilsa, operator yangi kod chiqarishi mumkin (throttled).
2. **Mijozning ongli roziligi:** mijoz `GET /user/queue` sahifasida o‘z akkauntiga kirib kodni kiritadi, `POST /api/queue/manual/claim`. Hash + expiry + queue status + bugungi sana + customer JWT PostgreSQL transactionda tekshiriladi. Kod darhol iste’mol qilinadi (`claim_hash=NULL`). Hech kim telefon, Telegram yoki boshqa kontaktni avtomatik bog‘lamaydi.
3. **Bir xil FIFO:** `smartBookingOffers.tick` endi sartarosh kiritgan **rozilik bilan akkauntga bog‘langan** manual ticketlarni ham QR-approved ticketlar bilan bir xil `queue_position,id` tartibida ko‘radi. Manual akkauntsiz ticketlar hech qachon avtomatik taklif olmaydi. Bu oddiy `call-next` navbatini o‘zgartirmaydi.
4. **Yangi autentifikatsiyalangan API:** `GET /api/queue/manual/mine`, `POST /offers/:id/decision/customer`, `POST /offers/:id/services/customer`, `POST /offers/:id/confirm-booking/customer`, `POST /manual/:id/revoke`. QR proof yo‘li bundan alohida; manual yo‘lda QR token o‘rniga **haqiqiy customer JWT + uning consent qilingan ticketi** talab qilinadi. Barber lockdan keyin consent qayta tekshiriladi (unlink race). Qabul qilish hali booking emas; v27 kabi 2min ichida server tekshirgan xizmatlar bilan `bookings` + service snapshots atomar yaratiladi.
5. **Rozilikni qaytarish:** Customer uning navbatini akkauntdan uzishi mumkin. Hali bron bo‘lmagan pending/accepted taklif bekor qilinadi, opening keyingi mos mijozga qaytadi. Mavjud haqiqiy bron avtomatik bekor qilinmaydi; uni Bronlar bo‘limida boshqarish kerak.
6. **39-migratsiya** `20261210_manual_queue_claims.sql` `walkin_manual_claims` (entry PK, hash UNIQUE, expiry, customer FK, consent timestamp, check constraints), bootstrap inventory va audit reyestrini yangilaydi. `consent_at` **DEFAULT NULL** va customer ko‘rsatilmaydi.

## Test chegarasi

```bash
cd backend
node --test test/manualQueueClaims.unit.test.js test/smartBookingConfirmation.unit.test.js test/smartBookingOffers.unit.test.js test/smartBookingTelegram.unit.test.js test/queueOfferConsent.unit.test.js
node --test test/bootstrap-plan.unit.test.js test/audit-phase1.unit.test.js
npm run audit:phase1
cd ../frontend
node --test test/*.test.js
```

- Yangi xizmat mock DB unit testlari; alohida staging schema va real PostgreSQL race/expiry/fetch sinovlari hali bajarilmadi. Unit PASS = PostgreSQL SQL bajarildi degani emas.
- JSX syntax global TypeScript parser bilan tekshirildi, Vite production build/ESLint to‘liq bajarilmadi (node_modules mavjud emas).
- Backend barcha unitlar o‘rnatilmagan `pg`, `express`, `bcrypt`, `jsonwebtoken` dependencies sabab yakuniga yetmagan. Production deploy uchun to‘liq regressiya zarur.

### Staging schema read-only audit — ixtiyoriy

Avval alohida `ustara_test_db` va `ustara_account_test` bilan barcha 39 migratsiya **qo‘lda operator ruxsati bilan** alohida stendda qo‘llangan bo‘lishi kerak. TEST user superuser emasligini tekshiring. Hech qanday haqiqiy foydalanuvchi ma’lumoti/tokenini ishlatmang.

```bash
NODE_ENV=test \
USTARA_MANUAL_DB_AUDIT=I_AUTHORIZE_READ_ONLY_TEST \
USTARA_TEST_DATABASE_URL='postgresql://ustara_account_test:TEST_PASSWORD@127.0.0.1:5432/ustara_test_db' \
npm run test:manual-queue:db
```

Test faqat `read_only=on`, session identity, migratsiya, check constraints va `consent`da default yo‘qligini tekshiradi. **Parallel bron integratsiya testi emas.** Env mavjud bo‘lmasa SKIP.

## Chiqarishdan oldin qolganlar (v30)

- Alohida test PostgreSQL bazasida haqiqiy ikki connection: `claim/claim`, `claim/revoke`, `revoke/accept`, `accept/confirm`, 2min expiry, `call-next` race va `bookings` exclusion constraint.
- Callback/polling/webhook hamda browser/mobil E2E (Telegram offer oldingi QR oqimiga tegishli; manual uchun hech qanday avtomatik Telegram opt-in yo‘q).
- Migration rollback/recovery plan, observability, deploy/worker supervision, complete `npm ci`, full suite, Vite build va lint.

**Eslatma:** manuallink shaxsiy ticketni ko‘rishga ixtiyoriy ruxsat, doimiy joylashuv yoki ovoz nazorati emas. Kod faqat ticket egasiga berilishi kerak.
