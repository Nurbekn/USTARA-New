function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function parseBookingTime(value) {
  if (typeof value !== "string") return NaN;
  const match = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  return match && validDate(match[1]) ? Date.parse(value) : NaN;
}
function minutes(value) {
  const match = /^(\d{2}):([0-5]\d)(?::00(?:\.0+)?)?$/.exec(value);
  if (!match || Number(match[1]) > 24 || (Number(match[1]) === 24 && Number(match[2]) !== 0)) throw new Error("Invalid working hours");
  return Number(match[1]) * 60 + Number(match[2]);
}
function timeString(value) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
module.exports = { validDate, parseBookingTime, minutes, timeString };
