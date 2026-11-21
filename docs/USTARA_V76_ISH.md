# USTARA v76 — Service archive without erasing bookings
2026-11-19. Source: v75. PRODUCTION READY: NO.

## Practical fixes
1. New authenticated PATCH /api/services/:id/status endpoint for archive/reactivate.
2. Requires barber role and ID within PostgreSQL int4 bounds.
3. Strictly accepts only `is_active: boolean`; rejects extra data.
4. Reuses barber advisory transaction lock order to serialize account changes.
5. Rejects unapproved / missing barber profiles.
6. Checks multi-service migration readiness, failing closed when absent.
7. Updates status only within the owning barber's services.
8. Changes only `is_active`, not price/name/duration/booking tables.
9. Nonexistent/foreign service yields 404, with transaction rollback.
10. Successful status changes COMMIT and return no-store response.
11. Database errors rollback and do not leak details to API clients.
12. Existing DELETE still hard-deletes unbooked services and returns 409 for referenced services (compatibility).
13. Delete-FK conflict returns typed `service_has_bookings` code.
14. Barber frontend gracefully archives service on that specific FK conflict and tells user historical bookings are saved.
15. Archiving removes service from public catalog and new booking selection (existing is_active filters).
16. Re-enabling can use the existing editor or status endpoint.
17. Added 20 backend tests covering route/auth/validation/transaction/migration/status toggles.

## Locally tested
- Focused backend: 86/86 PASS; 20 new tests included.
- Full frontend Node test suite: 267/267 PASS.
- Decision CSV is identical to v75 (SHA-256 bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71).
- All old forward and rollback migration SQL is byte-identical to v75.
- Isolated PostgreSQL integration, running production browser, Telegram and full backend suite: NOT RUN.
- Current hard-delete behavior with referencing bookings depends on DB FK constraint; service archive fallback was tested at backend unit level, not browser or PostgreSQL E2E.

Next: v77 enforce archive pricing/availability under concurrent bookings in a real isolated PostgreSQL test DB.
