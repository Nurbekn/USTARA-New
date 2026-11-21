# Phone-assisted booking invitation (v185)

A barber **does not create a customer booking** during a phone call. They can offer an unreserved, short-lived link pointing at their existing public service-selection page. The link carries no customer phone or customer ID. Only after the authenticated customer separately reviews live availability, service price and cancellation terms and confirms through the original POST /api/bookings does an actual booking exist.

## Safe workflow
1. Log in as an approved active barber, open Bronlar > Telefon orqali bron taklifi.
2. Select your active service, a date within the next 14 days, and a 5-minute-aligned Tashkent time. Create a 30-minute link. Send it manually to the caller.
3. The customer opens the URL to your public USTARA profile; only if token is active the proposed service/time is preselected in the normal booking form.
4. The customer signs in (if not already), checks actual slots/quote/policy and confirms using existing idempotent POST /api/bookings. The invitation never bypasses account authentication or books anything by itself.
5. The barber can revoke future lookups of an outstanding token, but this does not cancel any booking the customer has already made or prevent ordinary, independent bookings.

## Contracts and boundaries
- Only 256-bit random tokens are issued. `barber_phone_booking_invites.token_digest` is SHA-256 hex, not raw token.
- New table deliberately stores no customer identity or phone. No built-in SMS/Telegram automation.
- 10 links/hour per approved barber; creation checks an active service and a time within 14 days using DB clock. Service/slot can change later, so no availability is promised.
- GET token uses `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`; generic expired/revoked error; public metadata only.
- Active links can be revoked by their owner; other barbers/admin/customer cannot manage their creation or revocation.
- If the network fails during creation, the outcome is **unknown**. The client should list existing invites before retrying; raw token cannot be recovered from the DB.
- Existing `/api/bookings` race-safe customer booking creation and the verified quote checks remain unchanged.

## Remaining gap
This completes a consent-first link layer, **not fully manual operator-side bookings**. If the product needs service for customers without accounts, that requires separately approved identity/OTP, consent, double-booking protection and customer notification design. Do not silently implement bypasses.

## Verification
Run `node --test backend/test/v185PhoneBookingInvites.unit.test.js`, `node --test frontend/test/v185PhoneBookingInvites.test.js`, plus existing full suites after `npm ci` in a properly provisioned environment. The optional PostgreSQL integration must use an isolated test DB; migration is not auto-applied.
