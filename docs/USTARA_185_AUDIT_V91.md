# USTARA v91 — 185 qaror auditi

Asl 185 qaror CSV o‘zgarmadi, SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`.

Tarixiy holat: 130 ta **tekshiruv kerak**, 47 ta **qisman**, 7 ta **bekor/kechiktirilgan**, 1 ta **ochiq**. "Fully verified" = 0 (bu ishlab chiqilmagan degani emas, lekin real integratsiya isboti yetarli emas).

**#128 navbatdan ixtiyoriy chiqish** v91: COMMIT uncertain safety, strict int4 manual ticket ID, QR/manual stale response UI, action bloklash, public controller safe status, 58 yangi test. Real DB/QR/Chrome E2E yo‘qligi uchun **QISMAN**.

42 forward + 2 rollback SQL o‘zgarmagan (offline PASS); production-ready EMAS.
