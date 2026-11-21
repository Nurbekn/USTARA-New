# USTARA v95 — 185 qaror auditi

- Asl `USTARA_185_NAZORAT.csv`: 185 qaror, SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` — v94 bilan bir xil.
- Tarixiy toifalar: 130 tekshiruv kerak, 47 qisman, 7 kechiktirilgan/bekor, 1 ochiq (#175). CSV holatlari to‘liq bajarilgan funksiyalar soni emas.
- #23: `in_service`/`started_at`/event/backend/UI tekshiruvlari qo‘shildi, lekin “Keldi” alohida holati va real PG/mobil E2E qolgan. **QISMAN**.
- 42 ta avvalgi forward SQL fayl o‘zgarmadi. Bitta yangi `20261214_walkin_service_started.sql` qo‘shildi, jami 43 forward + 2 rollback, offline audit PASS.
- Frontend 655 PASS, backend 919 PASS / 26 dependency FAIL. Live PG SKIP. Production-ready **EMAS**.
