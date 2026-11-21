'use strict';
// Shared pg transport classification. An acknowledged ROLLBACK after a socket
// failure does not rehabilitate the previously broken connection.
const FAILURE_CODES = new Set([
  'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNABORTED', 'ENOTCONN',
  'ERR_STREAM_DESTROYED', '57P01', '57P02', '57P03'
]);
const FAILURE_MESSAGE = /^(?:connection terminated unexpectedly|connection ended unexpectedly|client has encountered a connection error|connection terminated|socket hang up|write EPIPE)/i;
function isPgConnectionBroken(error) {
  const visited = new Set();
  function check(value, depth) {
    if (!value || typeof value !== 'object' || visited.has(value) || depth > 12) return false;
    visited.add(value);
    if (typeof value.code === 'string' &&
        (value.code.startsWith('08') || FAILURE_CODES.has(value.code))) return true;
    if (typeof value.message === 'string' && FAILURE_MESSAGE.test(value.message)) return true;
    if (check(value.cause, depth + 1) || check(value.originalError, depth + 1)) return true;
    if (Array.isArray(value.errors))
      return value.errors.slice(0, 20).some(child => check(child, depth + 1));
    return false;
  }
  return check(error, 0);
}
module.exports = {isPgConnectionBroken};
