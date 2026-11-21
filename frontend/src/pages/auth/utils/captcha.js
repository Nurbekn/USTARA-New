const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const LIFETIME = 2 * 60 * 1000;

// Frontend test flow only. Real SMS endpoints must verify a server-issued
// CAPTCHA token before sending either the first message or a resend.
export function createCaptcha() {
  const random = crypto.getRandomValues(new Uint32Array(5));
  return {
    code: Array.from(random, (number) => ALPHABET[number % ALPHABET.length]).join(""),
    expiresAt: Date.now() + LIFETIME,
  };
}

export function checkCaptcha(challenge, answer) {
  if (Date.now() >= challenge.expiresAt) return "Kodning amal qilish muddati tugadi. Yangi kodni kiriting.";
  if (!answer.trim()) return "Bot emasligingizni tasdiqlash uchun rasmdagi kodni kiriting.";
  if (answer.trim().toUpperCase() !== challenge.code) return "Kod mos kelmadi. Yangi rasmdagi kodni kiriting.";
  return "";
}

