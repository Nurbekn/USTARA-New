# USTARA — 185 kelishuv / v37 audit

**Reyestr manbasi:** `docs/USTARA_185_NAZORAT.csv` (185 satr). 185 ta qarorning saqlanishi 185 ta tayyor funksiya degani emas.

| Holat | Soni |
|---|---:|
| Tekshiruv talab qiladi | 130 |
| Qisman bajarilgan | 47 |
| Bekor/keyinga qoldirilgan | 7 |
| Ochiq / #175 (shop deletion policy) | 1 |
| **Jami** | **185** |

## Shu versiyada dalil qo‘shilgan qaror
**#128 — Navbatdan ixtiyoriy chiqish:** QR proof yoki autentifikatsiyali manual owner tomonidan chiqish, `waiting/called -> left`, faqat bugungi navbat, ikki bosqichli UI tasdig‘i, takroriy so‘rovda yangi event yo‘q, unconfirmed offer va pending notifications bekor, tasdiqlangan bron o‘zgarmaydi. `backend/services/queueSelfExit.js`, controller/routes, frontend `QueueCheckIn.jsx` + `ManualQueue.jsx`, `20261212_queue_self_exit_audit.sql`. **Holat qisman:** real PostgreSQL E2E, opt-out/send race va mobil UX hali sinovsiz.

## Qolgan qarorlar
- Avval `docs/USTARA_DECISION_GAPS_v36.md`dagi bosqichlar bo‘yicha tekshirish xaritasidan davom eting; #128ni tekshiruv ro‘yxatidan chiqarib, qisman rejaga o‘tkazing.
- **#175:** shop tashkilot modeli, huquq/retention va o‘chirish siyosati hali kelishilmagan. Destructive deletion qilmang.
- Backend va frontend unit testlar real PG/Telegram/browser E2E o‘rnini bosa olmaydi; bu audit statik/strukturaviy dalil bilan cheklangan.
