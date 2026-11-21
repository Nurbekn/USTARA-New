# USTARA v165 — #67–#73 operatsion qarorlar

**Asos:** v164 ZIPdagi 185 ta qarorning asl `docs/USTARA_185_NAZORAT.csv` reyestri. Static source trace hisob **70 → 77 / 185**, hali **108** qaror indekslanmagan. Bu production tayyorlik o‘lchovi emas.

## Yangi kod

- `GET /api/admin/telegram/outbox` — faqat faol Admin uchun, oldindan mavjud v41 Telegram outbox agregatidan o‘qiydi; sonlar va xavf holatlari, shaxsiy xabar/ID/token qaytarilmaydi.
- `GET /api/admin/system/readiness` — DB outbox query orqali o‘qilgani, operator ogohlantirishlari va server-side rollout faolligini ko‘rsatadi. **Faqat outbox/DB tekshiruvi, butun infratuzilma sog‘lomligi emas**.
- Ruxsatlar: oldingi `authMiddleware`, `adminOnly` va handler ichida qo‘shimcha Admin guard. DB so‘rovlari bounded, `Cache-Control: no-store`, xato `503/unknown` bilan fail-closed.
- Frontend: Admin Telegram tabida navbat yig‘indisi, yangi **Tizim nazorati** tabida o‘qiladigan holat; uch tilda. Akkaunt almashish, tab/til o‘zgarishida eski so‘rov `abort` bo‘ladi. Xabar yuborish yoki rollback tugmasi mavjud emas.
- `USTARA_ADMIN_READONLY_ROLLOUT` server-side `0–100` foizlik stabil Admin cohort; 0=off, bo‘sh=100, buzilgan=0. Xavfli mavjud bron va OTP xulqi bu flagga bog‘lanmadi.
- `backend/scripts/v165-operations-checklist.cjs` paket talab qilmaydigan offline CLI; yangi manba auditi va CI preinstall bosqichiga qo‘shildi.
- `docs/v165-operations-runbook.md`: backup/restore drill, staged deploy, rollback va monitoringning **qo‘lda bajariladigan** yo‘riqnomalari; bu amallar bajarilmagan.
- Yangi SQL migratsiya qo‘shilmadi, eski SQL fayllarga tegilmadi.

## Asl qarorlar holati

| # | Qaror | v165 dalil va hali ochiq qismi |
|---|---|---|
| 67 | Admin Telegram Control Center | Admin outbox read-only holati bor, haqiqiy Telegram E2E yo‘q |
| 68 | Admin System Control va rollback | DB/outbox status bor, server restart va rollback **yo‘q** |
| 69 | Demo va avtomatlashtirilgan test markazi | Offline CLI va CI manba gate bor, Admin test UI/demo **yo‘q** |
| 70 | Monitoring xizmatlar va ogohlantirish | Operatorga outbox alerts bor, real alert routing/uzoq metrika **yo‘q** |
| 71 | Xavfsiz zaxira va tiklash | Qo‘llanma bor, avtomatlashtirilgan backup/restore drill **yo‘q** |
| 72 | Bosqichli deployment va rollback | Qo‘llanma va feature rollout ketma-ketligi bor, staging deploy/rollback sinovi **yo‘q** |
| 73 | Feature flags va bosqichli chiqarish | Yangi read-only Admin funksiyasi uchun 0–100% flag bor, umumiy feature-flag boshqaruv tizimi **yo‘q** |

## Natija

- v165 focused testlar **12/12 PASS** (10 backend, 2 frontend).
- Frontend umumiy **1643/1643 PASS**. Backend umumiy **1584/1613 PASS**, 29 ta test bu muhitda o‘rnatilmagan paketlar (`express` 11, `jsonwebtoken` 9, `bcrypt` 6, `pg` 3) sabab ishga tushmadi. Suite to‘liq yashil emas.
- Offline migration audit: **49 forward + 2 rollback PASS**, haqiqiy DBga migratsiya **NOT RUN**.
- JSX manbalari TypeScript parser bilan sintaktik tekshirildi; haqiqiy Vite production build **NOT RUN**.
- Real PostgreSQL, Telegram delivery, Chrome E2E, deploy, rollback va backup restore: **NOT RUN**.
- Production readiness: **NOT VERIFIED**.

