# USTARA v47 — bajarilgan 5 ish

**Manba:** v46 to‘liq loyiha, oldingi 185 qarorning matni o‘zgartirilmagan.

| № | Ish | Amalda o‘zgargan qism | Tekshiruv |
|---|---|---|---|
| 1 | Sartaroshning shaxsiy navbat ro‘yxatini yagona snapshotda o‘qish | `GET /api/queue/mine`: `BEGIN ISOLATION LEVEL REPEATABLE READ`, `barbers` va `users` uchun `FOR SHARE`, ikki ro‘yxat va `COMMIT` bir ulanishda; xatoda `ROLLBACK` | `v47QueueConsistency.unit.test.js` — id/sessiya, rollback, private response |
| 2 | Sartarosh navbatni qayta yakunlaganda qolgan xabarlarni tuzatish | `finish` idempotent replay eski navbat holati va auditni o‘zgartirmasdan hali yuborilmagan Telegram xabarlari va tasdiqlanmagan takliflarni tozalaydi | v46 eski replay testi yangilandi; v47 yangi test |
| 3 | QR va akkauntli navbatdan takroriy chiqishni ishonchli qilish | `queueSelfExit.closeQueueEntry`: `left` takrorida ham yetkazilmagan xabarlarni tozalaydi; QR va manual proof tekshiruvi, barber lock saqlanadi; ikkinchi `left` eventi yozilmaydi | `queueSelfExitV37.unit.test.js` va v47 replay/invalid proof testlari |
| 4 | Terminal cleanupni bitta manbaga birlashtirish | `queueOfferLifecycle.cleanupTerminalQueue`: QR/self-exit va barber finish bir xil himoyalangan SQL, faqat **tasdiqlanmagan** takliflar; ochilishlar id bo‘yicha dedupe; confirmed booking tegilmaydi | v47 shared helper test; real DB test **SKIP** |
| 5 | Telegram 429 polling uchun fail-closed kutish | Noto‘g‘ri yoki nomaʼlum `retry_after` (jumladan umuman kelmagani) avtomatik qisqa retry emas, operator review; boshqa transport xatosiga 5s backoff; ishchi kod ikkala xato yo‘liga bir xil helper ishlatadi | v47 retry va API unit testlari |

**Natijalar:** tanlangan `npm run test:v47:unit` — **39/39 PASS**. Backend to‘liq: **378 PASS, 26 FAIL (`MODULE_NOT_FOUND`)**, frontend: **175/175 PASS**. `v46QueueLifecycle.postgres.integration.test.js` — **1 SKIP**, real PostgreSQL yo‘q; Vite build `vite: not found`. Offline qaror 185 / migration 42 PASS. **Production-ready emas.**
