// ==========================================================
// format.js — small pure helpers for money, dates and times
// (manual Uzbek names: toLocaleDateString("uz-UZ") is not
// reliable across phones/browsers)
// ==========================================================

export const WEEKDAYS = [
  "Yakshanba", "Dushanba", "Seshanba", "Chorshanba",
  "Payshanba", "Juma", "Shanba",
];
export const SHORT_WEEKDAYS = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

export const MONTHS = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];
export const SHORT_MONTHS = [
  "Yan", "Fev", "Mar", "Apr", "May", "Iyn",
  "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek",
];

// 1250000 -> "1 250 000"
export const groupDigits = (n) =>
  String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export const formatMoney = (n) => `${groupDigits(n)} so'm`;

// Short form for chart labels: 1 200 000 -> "1.2 mln", 250 000 -> "250 ming"
export function shortMoney(n) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)} mln`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} ming`;
  return String(n);
}

// "2026-10-31" -> local Date (no timezone shift)
export const parseISO = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// "2026-10-31" -> "Bugun" / "Ertaga" / "Kecha" / "Juma, 6 noyabr"
export function dateLabel(iso, today = new Date()) {
  const date = parseISO(iso);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((date - start) / 86_400_000);
  if (diff === 0) return "Bugun";
  if (diff === 1) return "Ertaga";
  if (diff === -1) return "Kecha";
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

// "2026-10-31" -> "31 oktabr 2026"
export function longDate(iso) {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export const bookingStart = (b) => new Date(`${b.date}T${b.time}`);

// "10:30" + 45 -> "11:15"
export function addMinutes(time, minutes) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

// 75 -> "1 soat 15 daq"
export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} soat` : "", m ? `${m} daq` : ""].filter(Boolean).join(" ");
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return "Xayrli tun";
  if (h < 12) return "Xayrli tong";
  if (h < 18) return "Xayrli kun";
  return "Xayrli kech";
}
