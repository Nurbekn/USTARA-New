function parseDates(body, now = Date.now()) {
  const hours = Number(body?.hours);
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) return null;
  return { startsAt: new Date(now).toISOString(), expiresAt: new Date(now + hours * 3600000).toISOString() };
}
module.exports = { parseDates };
