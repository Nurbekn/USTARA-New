# USTARA v75 — Historical booking resilience / checkpoint
Date: 2026-11-19. Source: v74 ZIP (824 files). Production ready: NO.

## Implemented changes
1. Customer booking list: LEFT JOIN services so deleted/missing catalog rows do not suppress historical bookings.
2. Barber booking list: same resilience.
3. Admin booking detail: same resilience.
4. Customer booking detail: same resilience.
5. Barber booking detail: same resilience.
6. Booking detail ID: reject unsafe/postgres int4 out-of-range values.
7. Backend multi-service selection IDs: reject out-of-range int4 IDs prior to SQL binding.
8. Frontend persisted booking draft: reject out-of-range barber/service IDs.
9. Frontend create booking: reject out-of-range IDs before request.
10. Frontend create booking: reject times off the five-minute schedule before request.
11. 12 new backend regression tests cover historical service snapshots/price, join preservation, and ID validation.
12. 3 new frontend regression tests cover draft IDs, request IDs, and time-grid validation.

## Preserved existing behavior
- Server-computed price and duration snapshots for bookings after multi-service migration remain authoritative.
- Historical booking's saved total_price is never recomputed from today's catalog.
- Legacy records with no snapshot keep unknown price; no artificial values are invented.
- Existing 42 forward migrations and 2 rollback helpers were not changed.
- 185-decision master CSV SHA-256: bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71.

## Verified locally
- Frontend: 267/267 PASS (includes +3 new tests).
- Targeted backend: 19/19 PASS (includes +12 new tests and 7 existing tests).
- Other backend test suite, actual PostgreSQL, browser, Telegram, GitHub Actions: NOT_RUN / NOT_VERIFIED in this iteration.
- Previously known environment limitation: some backend npm dependencies are absent; do not treat unrun tests as passing.

## Remaining risk
- DB constraints may prevent hard-deleting service rows; LEFT JOIN protects history when rows are absent but does not alter FK policies.
- Browser E2E, PostgreSQL migrations, and integration checks remain required before production.
- Future v76: verify historical data/soft-deletion and price snapshot via isolated PostgreSQL E2E when available.
