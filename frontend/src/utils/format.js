const numberFormatter = new Intl.NumberFormat("uz-UZ");

export function formatNumber(value) {
  return numberFormatter.format(value);
}

export function formatMoney(value) {
  return `${formatNumber(value)} so‘m`;
}

export function formatDate(value, timeZone = "Asia/Tashkent") {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split("-").reverse().join("/");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Belgilanmagan";
  const options = { day: "2-digit", month: "2-digit", year: "numeric", timeZone };
  try {
    return new Intl.DateTimeFormat("en-GB", options).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "Asia/Tashkent" }).format(date);
  }
}

export function parseDateInput(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number(year) >= 1000 && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}
