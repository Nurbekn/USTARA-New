'use strict';
// v203: Lock the expected real PostgreSQL checks independently of the TAP
// footer counters. Updating this list requires reviewing the integration test.
const { validateTapReport } = require('./v195-tap-result-gate.cjs');
const EXPECTED_CASES = Object.freeze([
  'same customer at another barber overlaps; adjacent slot remains valid',
  'cancelled overlap allowed; changing cancelled back to confirmed is blocked',
  'two independent uncommitted inserts race across DIFFERENT barbers',
  'atomic service modification: stale quote and collision do not destroy original booking',
  'v104: quote is read-only and cannot cross account/profile boundaries',
  'v78: quoted booking snapshots survive price, duration and archival changes',
  'v78: separate connections serialize an archive UPDATE behind locked service selection',
  'v79: two API booking requests cannot commit the same barber slot',
  'v79: price change committed while booking awaits row lock rejects stale quote',
  'v81: lost response can be recovered by customer without creating a second booking',
  'v82: recovery before an uncommitted POST stays uncertain; later commit replays once',
  'v20: recurring breaks protect saved bookings, availability and concurrent modification',
]);

function assertIntegrationCaseCoverage(tap) {
  const proof = validateTapReport(tap);
  const names = tap.replace(/\r\n/g, '\n').split('\n')
    .filter(line => /^    ok [1-9]\d* - /.test(line))
    .map(line => line.replace(/^    ok [1-9]\d* - /, ''));
  if (proof.tests !== EXPECTED_CASES.length + 1 ||
      names.length !== EXPECTED_CASES.length ||
      names.some((name, index) => name !== EXPECTED_CASES[index])) {
    throw new Error('v203: expected PostgreSQL concurrency cases missing, modified or reordered');
  }
  return { ...proof, cases: names.length };
}
module.exports = { EXPECTED_CASES, assertIntegrationCaseCoverage };
