# USTARA v184 — sinovlar va ochiq tekshiruvlar

Maqsad: v182 #179 maxfiy bron qaydlari uchun eski, cheklanmagan tozalash skriptini operator tasdiqlaydigan xavfsiz retention ishiga almashtirish. v183 dan bazaviy kod saqlangan. Asl 185 qaror auditi 185/185, ammo release tayyorligi alohida masala.

| Sinov | Natija |
| --- | --- |
| `node --test backend/test/v184PrivateNoteRetention.unit.test.js` | 10/10 PASS |
| `node --test backend/test/v184PrivateNoteRetention.unit.test.js backend/test/v182PrivateBookingNotes.unit.test.js backend/test/v183PrivacyExport.unit.test.js` | 25/25 PASS |
| `cd backend && npm run test:unit` | 1709/1738 PASS, 29 test o'tmadi |
| `cd frontend && npm run test:unit` | 1715/1715 PASS |
| `node --check backend/services/privateNoteRetentionV184.js` va skript sintaksisi | PASS |
| v183 ZIP bilan faylma-fayl SHA-256 taqqoslash | 1429 eski faylning hech biri yo‘qolmagan; tarixiy SQL va 185 qaror reyestri o‘zgarmagan |

Backenddagi 29 xato `express`, `pg`, `jsonwebtoken`, `bcrypt` paketlarining bu muhitda mavjud emasligi bilan bog‘liq; to‘liq backend suite PASS emas. Frontend kodi bu versiyada o‘zgartirilmagan.

**Bajarilmagan:** `DATABASE_URL` bilan haqiqiy PostgreSQLga ulanish, `--execute` haqiqiy tozalash, boshqa rol bilan kirish, concurrency integratsiyasi, backup/restore, CI/deploy/scheduler va brauzer E2E. Ma’lumotlar o‘chirilmagan. Operator tasdig‘isiz cleanup jadvalga qo‘yilmagan. Production-ready **YO‘Q**.

Qolgan backlog: #160/#176 Quick Manual Booking, #177 Admin suspension, #110–#122 shop RBAC/jamoa, #175 xavfsiz shop yopish, #134 to‘liq Privacy Center, #88 booking media, #85 offline sync, real PostgreSQL/Telegram/browser sinovlari.
