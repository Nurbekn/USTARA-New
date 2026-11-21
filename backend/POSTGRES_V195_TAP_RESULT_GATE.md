# v195: Booking concurrency execution evidence

In the opt-in disposable PostgreSQL CI workflow, a green Node process alone is not sufficient proof the integration suite ran; Node may report a successful exit when tests were skipped. The v195 gate consumes the actual Node `--test --test-reporter=tap` stream and verifies the mandatory root test identity, nested subtest evidence, complete TAP summary and zero skipped/failed/todo/cancelled tests.

The test process is piped to the validator under `set -euo pipefail`. This ensures both a failing test runner and an invalid/incomplete TAP report fail the job. TAP output is echoed unchanged to the CI log. The validator is dependency-free, bounded to 4 MB and does not connect to a database, read `.env` or inspect application data. It does not independently prove database correctness; that requires the real PostgreSQL CI run after the v194 bootstrap proof.

Offline verification: `cd backend && npm run test:v195:unit`. Live verification: manually trigger `.github/workflows/v193-isolated-postgres-booking.yml` on a disposable GitHub runner, examine the v194 proof and v195 final line in job logs. Do not run against production.
