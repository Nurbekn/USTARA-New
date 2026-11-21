const DAY = 86400000;
export const BOOKING_DAYS = 14;
export const bookingTimestamp = (date, time) => Date.parse(`${date}T${time}:00+05:00`);

export function tashkentDate(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function bookingDates(now = Date.now()) {
  const noon = bookingTimestamp(tashkentDate(now), "12:00");
  return Array.from({ length: BOOKING_DAYS }, (_, index) => tashkentDate(noon + index * DAY));
}
