# USTARA v90 — bajarilgan funksional ishlar

- `backend/services/queueLiveEstimate.js`: 24 soatdan oshgan taxminiy ETA null bo‘ladi, navbat soni esa saqlanadi.
- `backend/controllers/queuePublicController.js`: Toshkent sanasi barcha queue query qismlarida bitta SQL statement timestamp asosida.
- `frontend/src/pages/user/barber/publicQueueModel.js`: server javobi (barber ID, integer counts, UTC as_of, ETA, only public fields) va late response race guard.
- `frontend/src/pages/user/barber/PublicQueueSummary.jsx`: 30s polling, tab faollashishi / internet tiklanishi / window focus, stale/offline failure va manual retry.
- `frontend/test/v90PublicQueueFreshness.test.js`: 55 yangi test.
- `backend/test/v90PublicQueueEstimate.unit.test.js`: 12 yangi test.
- #35 hamda #173 QISMAN, real PostgreSQL/live UI E2E NOT_RUN.
