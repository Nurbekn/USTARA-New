// Shared, side-effect-free validation for the barber service editor.
// This is UI validation only; the API remains the source of authority.
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u;
export function normalizeServiceName(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}
export function parseServicePrice(value) {
  if ((typeof value !== "string" && typeof value !== "number") ||
      !/^[0-9]{1,8}$/.test(String(value))) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 1000 && amount <= 99999999 ? amount : null;
}
export function stepServicePrice(value, change) {
  const current = parseServicePrice(value) ?? 0;
  return Math.min(99999999, Math.max(1000, current + change));
}
export function validateServiceDraft(form) {
  if (!form || typeof form !== "object" || Array.isArray(form)) return { ok: false, message: "Xizmat ma’lumotlari noto‘g‘ri." };
  const name = normalizeServiceName(form.name);
  if (INVISIBLE.test(name) || Array.from(name).length < 2 || Array.from(name).length > 50)
    return { ok: false, message: "Xizmat nomi 2–50 belgidan iborat bo‘lsin." };
  const price = parseServicePrice(form.price);
  if (price === null) return { ok: false, message: "Narx 1 000–99 999 999 so‘m oralig‘ida bo‘lsin." };
  const duration = form.duration;
  if (!Number.isInteger(duration) || duration < 5 || duration > 60 || duration % 5 !== 0)
    return { ok: false, message: "Davomiylik 5–60 daqiqa, 5 daqiqalik qadamda bo‘lsin." };
  return { ok: true, name, price, duration };
}
