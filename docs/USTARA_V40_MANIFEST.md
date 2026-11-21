# USTARA v40 ZIP yaxlitlik hisoboti (2026-11-19)

- v39 ZIP: **619 fayl**; v40 yig‘ishdan oldin barcha eski fayllarning mavjudligi solishtirildi
- O‘chirilgan eski fayllar: **0**
- Yangilangan eski fayllar: **7**
- Yangi fayllar (manifestdan oldin): **8**
- 185 qaror CSV SHA256: `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71` (o‘zgarmadi)
- SQL migratsiyalar: **42** (yangi yo‘q)
- ZIP `.env`, `node_modules`, `dist`, `.git` va shaxsiy tokenlar bilan to‘ldirilmagan

## Yangilangan yo‘llar
- `USTARA-New/backend/package.json`
- `USTARA-New/backend/services/queueTelegramNotifications.js`
- `USTARA-New/backend/test/queueTelegramNotifications.unit.test.js`
- `USTARA-New/docs/USTARA_LATEST_CHECKPOINT.md`
- `USTARA-New/docs/USTARA_PROGRESS.md`
- `USTARA-New/frontend/src/pages/queue/ManualQueue.jsx`
- `USTARA-New/frontend/test/queueSelfExitV37.test.js`

## Yangi yo‘llar
- `USTARA-New/backend/WALKIN_QUEUE_V40.md`
- `USTARA-New/backend/scripts/v40-staging.js`
- `USTARA-New/backend/test/v40QueueConsent.unit.test.js`
- `USTARA-New/backend/test/v40StagingGuard.unit.test.js`
- `USTARA-New/docs/USTARA_185_AUDIT_V40.md`
- `USTARA-New/docs/USTARA_V40_5_ISH.md`
- `USTARA-New/frontend/src/pages/queue/manualQueueActionV40.js`
- `USTARA-New/frontend/test/manualQueueActionV40.test.js`

Real PostgreSQL/Telegram E2E bu hisobotga kirmaydi. ZIP tarkibi va CRC fizik tekshiruvdan o‘tishi kerak.
