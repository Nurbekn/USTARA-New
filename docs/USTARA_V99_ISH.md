# USTARA v99 — 5 ish

1. **Xavf tahlili:** `callNext` SELECT sanani tekshirgan, lekin `UPDATE` tekshirmagan. SELECT va UPDATE orasida Tashkent sanasi almashganda kechagi ticket chaqirilishi mumkin edi.
2. **Call fence:** `status='waiting'` va `queue_date` ikkalasi ham UPDATE paytida tekshiriladi, xato bo‘lsa ROLLBACK va event/Telegram yo‘q.
3. **Reorder fence:** barcha qatorlar aynan bugungi waiting navbatga tegishli bo‘lishi shart. `rowCount` kamaygan holatda tranzaksiya rollback; audit yozilmaydi.
4. **Regression:** 9 yangi test va eski reorder mockini yangilash. Backend va frontend keng regressiyasi.
5. **Yaxlitlik:** 185 qaror, 44 forward/2 rollback SQL o‘zgarmagan; SHA-256 solishtirish; ZIP va checkpoint.

Bu oʻzgarishlar real PostgreSQL integratsiya tekshiruvlarini almashtirmaydi. Production-ready emas.
