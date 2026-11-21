export function normalizePhone(value) {
  if (typeof value !== "string" || value.length > 60 || !/^[+\d\s()-]+$/.test(value)) {
    throw new Error("Telefon raqami noto‘g‘ri.");
  }
  let phone = value.replace(/[\s()-]/g, "");
  if (/^\d{9}$/.test(phone)) phone = `+998${phone}`;
  else if (/^998\d{9}$/.test(phone)) phone = `+${phone}`;
  else if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) throw new Error("Telefon raqami noto‘g‘ri.");
  return phone;
}

export const formatPhone = (value) => {
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 12 && digits.startsWith("998") ? digits.slice(3) : digits;
  const d = national.slice(0, 9);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 9)]
    .filter(Boolean)
    .join(" ");
};
