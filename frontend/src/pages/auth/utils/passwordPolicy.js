export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_HINT = "8–128 belgi · Harf va raqam ishlating.";

export const COMMON_PASSWORDS = Object.freeze([
  "123456", "12345678", "123456789", "1234567890", "password", "password1",
  "password12", "password123", "password1234", "password1!", "p@ssword1",
  "p@ssw0rd", "p@ssw0rd1", "passw0rd", "passw0rd1", "qwerty", "qwerty123",
  "qwerty1234", "qwerty12", "qwertyuiop", "qwerty1!", "abc123", "abc12345",
  "abc123456", "abcd1234", "abcdef123", "12345678a", "123456789a",
  "a12345678", "a123456789", "admin123", "admin1234", "administrator1",
  "welcome1", "welcome123", "welcome123!", "letmein1", "iloveyou1",
  "football1", "monkey123", "dragon123", "changeme1", "test1234", "test12345",
  "1q2w3e4r", "1qaz2wsx", "zaq12wsx", "11111111a", "ustara123",
]);

const commonPasswords = new Set(COMMON_PASSWORDS);

export function passwordError(value) {
  if (typeof value !== "string") return "Parol matn ko‘rinishida bo‘lishi kerak.";
  const length = Array.from(value).length;
  if (length < 8 || length > PASSWORD_MAX_LENGTH) return "Parol 8–128 ta belgidan iborat bo‘lishi kerak.";
  if (commonPasswords.has(value.trim().toLowerCase())) return "Bu parol juda kuchsiz. Boshqa parol tanlang.";
  if (!/\p{L}/u.test(value) || !/\p{N}/u.test(value)) return "Parolda kamida bitta harf va bitta raqam bo‘lishi kerak.";
  return "";
}
