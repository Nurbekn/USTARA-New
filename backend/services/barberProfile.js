const { names } = require("../utils/registration");

class BarberProfileError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const fail = (message, code = "invalid_profile") => {
  throw new BarberProfileError(400, message, code);
};

function optionalText(value, label, maxLength = Infinity) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") fail(`${label} matn bo‘lishi kerak.`);
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (Array.from(cleaned).length > maxLength) fail(`${label} ${maxLength} belgidan oshmasin.`);
  return cleaned;
}

function avatarUrl(value) {
  const cleaned = optionalText(value, "Avatar URL");
  if (cleaned === null) return null;
  if (cleaned.startsWith("data:")) {
    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(cleaned);
    if (!match || cleaned.length > 900000) fail("Avatar JPEG URL formati noto‘g‘ri yoki hajmi katta.");
    const decoded = Buffer.from(match[1], "base64");
    if (!decoded.length || decoded.toString("base64") !== match[1]) fail("Avatar JPEG URL formati noto‘g‘ri.");
    return cleaned;
  }
  if (cleaned.length > 2048) fail("Avatar URL 2048 belgidan oshmasin.");
  let parsed;
  try { parsed = new URL(cleaned); } catch { fail("Avatar URL noto‘g‘ri."); }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    fail("Avatar URL faqat HTTP yoki HTTPS manzili bo‘lishi mumkin.");
  }
  return parsed.href;
}

function normalizeCertificates(value) {
  if (!Array.isArray(value) || value.length > 5) fail("Sertifikatlar 0 dan 5 tagacha ro‘yxat bo‘lishi kerak.", "invalid_certificates");
  const keys = new Set(["title", "issuer", "year"]);
  const seen = new Set();
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
      Object.keys(item).some((key) => !keys.has(key)) ||
      !Object.hasOwn(item, "title") || !Object.hasOwn(item, "issuer") || !Object.hasOwn(item, "year")) {
      fail("Sertifikat ma’lumotlari noto‘g‘ri.", "invalid_certificates");
    }
    const title = optionalText(item.title, "Sertifikat nomi", 80);
    const issuer = optionalText(item.issuer, "Sertifikat bergan tashkilot", 80);
    const year = item.year;
    if (!title || !issuer || !Number.isSafeInteger(year) || year < 1950 || year > new Date().getUTCFullYear()) {
      fail("Sertifikat nomi, tashkilot yoki yili noto‘g‘ri.", "invalid_certificates");
    }
    const key = `${title.toLocaleLowerCase()}|${issuer.toLocaleLowerCase()}|${year}`;
    if (seen.has(key)) fail("Takroriy sertifikatga ruxsat yo‘q.", "duplicate_certificate");
    seen.add(key);
    return { title, issuer, year };
  });
}

const FIELD_ALIASES = {
  first_name: ["first_name", "firstName"],
  last_name: ["last_name", "lastName"],
  salon_name: ["salon_name", "salonName"],
  address: ["address"],
  experience_years: ["experience_years", "experience"],
  bio: ["bio", "about"],
  avatar_url: ["avatar_url", "avatarPhoto"],
  location: ["location"],
  certificates: ["certificates"],
};

function normalizeBarberProfilePatch(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("So‘rov ma’lumotlari obyekt bo‘lishi kerak.", "invalid_body");
  const recognized = new Set(Object.values(FIELD_ALIASES).flat());
  const unknown = Object.keys(body).filter((key) => !recognized.has(key));
  if (unknown.length) fail("Profil so‘rovida ruxsat etilmagan maydon bor.", "invalid_profile_field");

  const patch = {};
  for (const [column, aliases] of Object.entries(FIELD_ALIASES)) {
    const present = aliases.filter((key) => Object.hasOwn(body, key));
    if (present.length > 1) fail("Bir profil maydoni takroran yuborildi.");
    if (present.length) patch[column] = body[present[0]];
  }
  if (!Object.keys(patch).length) fail("Yangilash uchun profil maydonini yuboring.");

  if (Object.hasOwn(patch, "first_name") || Object.hasOwn(patch, "last_name")) {
    if (!Object.hasOwn(patch, "first_name") || !Object.hasOwn(patch, "last_name")) {
      fail("Ism va familiyani birga yuboring.", "invalid_name");
    }
    let normalized;
    try { normalized = names(patch.first_name, patch.last_name); }
    catch (error) { throw new BarberProfileError(error.status || 400, error.message, error.code || "invalid_name"); }
    patch.first_name = normalized.first;
    patch.last_name = normalized.last;
  }
  if (Object.hasOwn(patch, "salon_name")) {
    patch.salon_name = optionalText(patch.salon_name, "Sartaroshxona nomi");
    if (patch.salon_name !== null && Array.from(patch.salon_name).length < 2) {
      fail("Sartaroshxona nomi kamida 2 belgidan iborat bo‘lishi kerak.");
    }
  }
  if (Object.hasOwn(patch, "address")) patch.address = optionalText(patch.address, "Manzil");
  if (Object.hasOwn(patch, "bio")) patch.bio = optionalText(patch.bio, "Bio", 200);
  if (Object.hasOwn(patch, "avatar_url")) patch.avatar_url = avatarUrl(patch.avatar_url);
  if (Object.hasOwn(patch, "experience_years")) {
    const value = patch.experience_years;
    if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 99)) fail("Tajriba yillari 0 dan 99 gacha butun son bo‘lishi kerak.");
  }
  if (Object.hasOwn(patch, "certificates")) patch.certificates = normalizeCertificates(patch.certificates);
  if (Object.hasOwn(patch, "location")) {
    const location = patch.location;
    if (location === null) {
      patch.latitude = null;
      patch.longitude = null;
    } else if (location && typeof location === "object" && !Array.isArray(location)
      && Number.isFinite(location.lat) && Number.isFinite(location.lng)
      && Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180) {
      patch.latitude = location.lat;
      patch.longitude = location.lng;
    } else {
      fail("Joylashuv kengligi yoki uzunligi geografik oraliqda emas.");
    }
    delete patch.location;
  }
  return patch;
}

const PROFILE_COLUMNS = [
  "id", "first_name", "last_name", "salon_name", "address", "latitude", "longitude",
  "experience_years", "bio", "avatar_url", "certificates", "specialty", "verification_status", "accepting_bookings", "created_at",
];
const PROFILE_SELECT = PROFILE_COLUMNS.map((column) => `b.${column}`).join(", ");
const PUBLIC_PROFILE_SELECT = [
  "id", "first_name", "last_name", "salon_name", "address", "latitude", "longitude",
  "experience_years", "bio", "avatar_url", "certificates", "specialty",
].map((column) => `b.${column}`).join(", ");
const UPDATE_COLUMNS = new Set(PROFILE_COLUMNS.filter((column) => ![
  "id", "specialty", "verification_status", "accepting_bookings", "created_at",
].includes(column)));

function createBarberProfileService(database) {
  return {
    async getOwn(profileId, accountId) {
      const result = await database.query(
        `SELECT ${PROFILE_SELECT}, u.phone FROM barbers b JOIN users u ON u.id=b.user_id
         WHERE b.id=$1 AND b.user_id=$2 AND u.role='barber'`,
        [profileId, accountId],
      );
      return result.rows[0] || null;
    },
    async getPublic(profileId) {
      const result = await database.query(
        // #159: canonical barber number is intentionally PUBLIC only for approved,
        // active barber accounts. Customer phone fields are NEVER joined here.
        `SELECT ${PUBLIC_PROFILE_SELECT}, u.phone AS phone FROM barbers b
         JOIN users u ON u.id=b.user_id AND u.role='barber' AND u.deactivated_at IS NULL
         WHERE b.id=$1 AND b.verification_status='approved'`,
        [profileId],
      );
      return result.rows[0] || null;
    },
    async update(profileId, accountId, patch) {
      const entries = Object.entries(patch);
      if (!entries.length || entries.some(([column]) => !UPDATE_COLUMNS.has(column))) {
        throw new BarberProfileError(400, "Profil so‘rovida ruxsat etilmagan maydon bor.", "invalid_profile_field");
      }
      const values = [profileId, accountId];
      const assignments = entries.map(([column, value]) => {
        values.push(column === "certificates" ? JSON.stringify(value) : value);
        return `${column}=$${values.length}${column === "certificates" ? "::jsonb" : ""}`;
      });
      const result = await database.query(
        `UPDATE barbers AS b SET ${assignments.join(", ")}
         WHERE b.id=$1 AND b.user_id=$2
           AND EXISTS (SELECT 1 FROM users u WHERE u.id=b.user_id AND u.role='barber')
         RETURNING ${PROFILE_COLUMNS.map((column) => `b.${column}`).join(", ")}`,
        values,
      );
      return result.rows[0] || null;
    },
  };
}

module.exports = { BarberProfileError, normalizeBarberProfilePatch, createBarberProfileService };
