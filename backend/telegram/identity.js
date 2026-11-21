// Reject imprecise JSON numbers; PostgreSQL BIGINT values stay decimal strings.
function telegramId(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  if (!['number', 'string'].includes(typeof value)) return null;
  const id = String(value);
  return /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n ? id : null;
}
module.exports = { telegramId };
