# Admin account suspension — v187

## Model

`users.admin_suspended_at IS NOT NULL` indicates an Admin-imposed login/access suspension.
It is distinct from user-controlled `deactivated_at`. The existing booking records
are not cancelled, transferred, or deleted. The suspension audit table records actor,
change type, short reason, and time (not phone numbers or bearer tokens).

## API

`PATCH /api/admin/users/:role/:id/suspension` requires an active Admin token.

Body for suspend:

```json
{"action":"suspend","expectedSuspended":false,"reason":"Operator review required"}
```

Body for restore:

```json
{"action":"restore","expectedSuspended":true,"reason":"Appeal approved by operator"}
```

Errors: 400 malformed input, 403 inactive/non-Admin, 404 missing profile,
409 stale state, 503 unknown database outcome. **Never auto-retry** a 503:
refresh `/api/admin/users` and verify the new state first. This operation is
transactional, but a successful COMMIT can have an unknown network result.

## Security

Suspension uses profile → users row locking, session version increment and device
session revocation in one transaction. The login query uses a users row share lock
and prevents session creation during a concurrent suspension. Existing private
endpoints use `getIdentity` and deny suspended accounts. Restoring suspension does
not restore old device sessions and does not lift user-requested deactivation.

**Operational warning:** pending and confirmed bookings remain; notify the
participants and resolve bookings manually following the agreed booking rules.
This v187 change does **not** implement automatic notifications or transfer.

## Before deploy

- Apply migration on an isolated/staging database, not production first.
- Run full integration/E2E with npm dependencies installed, test login and
  authenticated requests before/during/after suspend and restore.
- Test rollback planning, race conditions and operator notifications separately.
