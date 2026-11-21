'use strict';
// Fail-closed guard for the OPTIONAL v193 disposable PostgreSQL integration job.
// No packages installed, network access, .env reads, SQL execution or token output.
const { validateLocalTestUrl } = require('../database/poolConfig');
const APPROVAL = 'I_AUTHORIZE_TEST_DATA';
const TEST_USER = 'ustara_account_test';

function checkIsolatedDbGate(env = process.env) {
  if (env.NODE_ENV !== 'test') throw new Error('v193: NODE_ENV must be test');
  if (env.USTARA_BOOKING_CONCURRENCY_TESTS !== APPROVAL) {
    throw new Error('v193: explicit disposable booking fixture approval missing');
  }
  const value = env.USTARA_TEST_DATABASE_URL;
  if (!value) throw new Error('v193: disposable test database URL missing');
  const target = validateLocalTestUrl(value, 'v193 disposable PostgreSQL');
  if (target.sessionUser !== TEST_USER) throw new Error('v193: non-privileged test role required');
  // Only a direct loopback TCP URL: no Unix socket, alternate resolved host,
  // query overrides, or remote/production service identifiers.
  const url = target.url;
  if (!['127.0.0.1', '::1'].includes(target.host) || url.search || url.hash || url.port && Number(url.port) !== 5432) {
    throw new Error('v193: exact loopback TCP target is required');
  }
  if (!url.password) throw new Error('v193: test role must authenticate independently');
  if (env.DATABASE_URL || env.DB_HOST || env.DB_NAME || env.TELEGRAM_BOT_TOKEN || env.BOT_TOKEN) {
    throw new Error('v193: production or Telegram runtime variables must not be present');
  }
  // Never print or return a password or the full URL.
  return { database: target.database, user: TEST_USER, host: target.host, port: target.port };
}

if (require.main === module) {
  try {
    const safe = checkIsolatedDbGate();
    console.log(`v193 disposable database gate PASS: ${safe.user}@${safe.host}:${safe.port}/${safe.database}`);
  } catch {
    console.error('v193 disposable database gate BLOCKED (review test-only environment and opt-in)');
    process.exitCode = 1;
  }
}
module.exports = { checkIsolatedDbGate };
