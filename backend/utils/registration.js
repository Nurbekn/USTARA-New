const crypto = require("node:crypto");
const OTP_DIGITS = 5;
const OTP_PATTERN = new RegExp(`^\\d{${OTP_DIGITS}}$`);
const OTP_LIMIT = 10 ** OTP_DIGITS;

class RegistrationError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function fail(status, message, code) {
  return new RegistrationError(status, message, code);
}

function bodyObject(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw fail(400, "So'rov ma'lumotlari obyekt bo'lishi kerak", "invalid_body");
  }
  return body;
}

function normalizePhone(value) {
  if (typeof value !== "string" || value.length > 60 || !/^[+\d\s()-]+$/.test(value)) {
    throw fail(400, "Telefon raqami noto'g'ri", "invalid_phone");
  }
  let phone = value.replace(/[\s()-]/g, "");
  if (/^\d{9}$/.test(phone)) phone = `+998${phone}`;
  else if (/^998\d{9}$/.test(phone)) phone = `+${phone}`;
  else if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) {
    throw fail(400, "Telefon raqami xalqaro formatda bo'lishi kerak", "invalid_phone");
  }
  return phone;
}

function sessionHash(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw fail(401, "Registration session yaroqsiz yoki muddati tugagan", "invalid_session");
  }
  return crypto.createHash("sha256").update(value).digest("hex");
}

function names(firstName, lastName) {
  const clean = (value) => {
    if (typeof value !== "string") throw fail(400, "Ism va familiya kiritilishi shart", "invalid_name");
    const result = value.normalize("NFC").trim().replace(/ +/g, " ");
    if (!/^[\p{L}\p{M}][\p{L}\p{M} '\u2018\u2019\u02bb\u02bc-]*$/u.test(result)
      || Array.from(result).length > 80) {
      throw fail(400, "Ism yoki familiya noto'g'ri", "invalid_name");
    }
    return result;
  };
  const first = clean(firstName);
  const last = clean(lastName);
  return { first, last };
}

function createOtpCrypto(env = process.env) {
  function key(keyId) {
    const activeId = env.OTP_HMAC_KEY_ID || "v1";
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(activeId)
      || (keyId && keyId !== activeId) || typeof env.OTP_HMAC_KEY !== "string"
      || Buffer.byteLength(env.OTP_HMAC_KEY, "utf8") < 32) {
      throw fail(503, "OTP xizmati sozlanmagan", "otp_unavailable");
    }
    return { id: activeId, value: env.OTP_HMAC_KEY };
  }
  function hash(phone, registrationId, nonce, code, keyId) {
    const secret = key(keyId);
    return crypto.createHmac("sha256", secret.value)
      .update(JSON.stringify([phone, String(registrationId), nonce, code])).digest("hex");
  }
  return {
    ready: () => key(),
    token: () => crypto.randomBytes(32).toString("hex"),
    issue(phone, id) {
      const { id: keyId } = key();
      const code = String(crypto.randomInt(0, OTP_LIMIT)).padStart(OTP_DIGITS, "0");
      const nonce = crypto.randomBytes(32).toString("hex");
      return { code, nonce, keyId, hash: hash(phone, id, nonce, code, keyId) };
    },
    matches(pending, code) {
      const expected = hash(pending.phone, pending.id, pending.otp_issuance_nonce, code, pending.otp_hmac_key_id);
      const actual = pending.otp_hmac_hash;
      return typeof actual === "string" && /^[0-9a-f]{64}$/.test(actual)
        && crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
    },
  };
}

module.exports = { RegistrationError, fail, bodyObject, normalizePhone, sessionHash, names,
  OTP_DIGITS, OTP_PATTERN, createOtpCrypto };
