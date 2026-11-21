# USTARA v56 — 185 qaror auditi

185 qaror CSV **byte-for-byte o'zgarmagan**. SHA-256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`.

- Jami: **185** qaror.
- Tasdiqlanmagan/tekshirish kerak: **130**.
- Qisman: **47**.
- Keyinga qoldirilgan yoki bekor: **7**.
- Ochiq: **1 (#175 — to'liq shop deletion)**.
- Forward migratsiya: **42**, qo'shimcha 2 rollback SQL fayli bor.
- v56 PostgreSQL sxemasini va qarorlar matnini o'zgartirmadi.

**Bu audit barcha 185 talab production'da ishlaydi degani emas.** CI, real PostgreSQL va E2E sinovlari shart.
