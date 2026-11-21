const bcrypt = require("bcrypt");
const crypto = require("node:crypto");

const LONG_PASSWORD_PREFIX = "ustara-sha256-bcrypt:";
const WEAK_PASSWORDS = new Set([
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

function validateRegistrationPassword(password) {
  if (typeof password !== "string") {
    return "Parol matn ko'rinishida bo'lishi kerak";
  }

  const length = Array.from(password).length;
  if (length < 8 || length > 128) {
    return "Parol 8 dan 128 tagacha belgidan iborat bo'lishi kerak";
  }

  if (WEAK_PASSWORDS.has(password.trim().toLowerCase())) {
    return "Bu parol juda kuchsiz. Boshqa parol tanlang";
  }

  if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password)) {
    return "Parolda kamida bitta harf va bitta raqam bo'lishi kerak";
  }

  return null;
}

function digestLongPassword(password) {
  return crypto.createHash("sha256").update(password, "utf8").digest("hex");
}

async function hashPassword(password) {
  if (Buffer.byteLength(password, "utf8") <= 72) {
    return bcrypt.hash(password, 10);
  }

  const hash = await bcrypt.hash(digestLongPassword(password), 10);
  return `${LONG_PASSWORD_PREFIX}${hash}`;
}

async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== "string") return false;

  if (storedHash.startsWith(LONG_PASSWORD_PREFIX)) {
    return bcrypt.compare(
      digestLongPassword(password),
      storedHash.slice(LONG_PASSWORD_PREFIX.length),
    );
  }

  // Existing bcrypt hashes were made from the raw password; keep them valid.
  return bcrypt.compare(password, storedHash);
}

module.exports = { validateRegistrationPassword, hashPassword, verifyPassword };
