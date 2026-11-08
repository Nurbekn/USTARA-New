// Saved schedules use Uzbekistan time, independently of the device timezone.
const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tashkent", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const validTime = (value) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function getAvailability(profile, now = new Date()) {
  const parts = Object.fromEntries(clock.formatToParts(now).map(({ type, value }) => [type, value]));
  const today = profile.hours?.find((h) => h.day === DAYS.indexOf(parts.weekday));
  if (!profile.isAvailable) return { isOpen: false, detail: "Bron qabul qilish o'chirilgan" };
  if (!today) return { isOpen: false, detail: "Bugungi ish vaqti belgilanmagan" };
  if (today.isOff) return { isOpen: false, detail: "Bugun dam olish kuni" };
  if (!validTime(today.start) || !validTime(today.end) || today.start >= today.end) {
    return { isOpen: false, detail: "Ish jadvalini tekshiring" };
  }
  const time = `${parts.hour}:${parts.minute}`;
  if (time < today.start) return { isOpen: false, detail: `${today.start} da ochiladi` };
  if (time >= today.end) return { isOpen: false, detail: "Bugungi ish vaqti tugadi" };
  return { isOpen: true, detail: `${today.end} gacha ochiq` };
}
