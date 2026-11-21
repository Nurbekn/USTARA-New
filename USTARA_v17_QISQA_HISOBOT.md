# USTARA v17 — qisqa hisobot

- 3-bosqichda #17 cancellation policy rivojlantirildi.
- Sartarosh o‘z jadvalida bekor qilish muddatini va izohini belgilaydi.
- Mijoz bron qilishdan oldin qoidani ko‘radi, vaqtda o‘zgarsa server 409 qaytaradi.
- Bron yaratilganda snapshot saqlanadi; keyinchalik barber qoida o‘zgartirsa avvalgi bron o‘zgarmaydi.
- Customer cancellation serverda DB clock bilan tekshiriladi. Barber exception, replay idempotency saqlandi.
- Hech qanday onlayn to‘lov yoki avtomatik jarima yo‘q.
- Tekshiruv: backend 351/351; frontend 137/137; frontend build PASS; offline audit 185 qaror/30 migration.
- Real PostgreSQL/E2E yo‘qligi sabab prodga tayyor emas. 3-bosqich qisman.
- Keyingi ZIP: v17, davom: #8/#90 jadval tanaffuslari.
