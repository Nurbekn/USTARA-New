# USTARA v97 — amalga oshirilgan ishlar

1. `arrived` holatida QR orqali ixtiyoriy navbatdan chiqish qo‘shildi.
2. `arrived` holatida tasdiqlangan manual navbatdan chiqish qo‘shildi.
3. QR va manual UI uchun bitta self-exit eligibility helper bilan uyg‘unlik yaratildi.
4. Lokal test PostgreSQL uchun 44-migratsiyali read-only readiness preflight qo‘shildi.
5. Ikki qurilmali arrival/leave race integratsiya testi va 49 yangi unit test qo‘shildi.

**Tekshiruv:** frontend 696 PASS; backend 991 PASS / 26 missing-dependency FAIL; 44 forward SQL offline PASS; haqiqiy PostgreSQL NOT_RUN. Oldingi kod va qarorlar saqlangan. Production-ready emas.
