const pool = require("../db");
const { names, RegistrationError } = require("../utils/registration");
const { registrationRequired } = require("./registrationController");
const { createAccountDeletionService, AccountDeletionError } = require("../services/accountDeletionService");
const accountDeletion = createAccountDeletionService(pool);

// IDs are PostgreSQL int4. Reject exponent/hex notation and unsafe numbers
// before they can be silently interpreted as another customer's account.
const customerId = (value) => {
  const digits = typeof value === "number"
    ? Number.isSafeInteger(value) ? String(value) : ""
    : typeof value === "string" ? value : "";
  if (!/^[1-9]\d*$/.test(digits)) return null;
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) && parsed <= 2147483647 ? parsed : null;
};
const customerContactView = (row, admin = false) => ({
  id: row.id, first_name: row.first_name,
  last_name: row.last_name,
  ...(admin ? { phone: row.phone } : {}),
  created_at: row.created_at,
});

// Barcha mijozlarni olish
async function getCustomers(req, res, _next, database = pool) {
  // Customer phone numbers are private: a barber sees them only on their
  // own booking, never through the directory or a customer profile lookup.
  if (typeof res.set === "function") res.set("Cache-Control", "no-store");
  try {
    if (req.user?.role !== "admin" && req.user?.role !== "barber") {
      return res.status(403).json({ message: "Bu amal uchun ruxsat yo'q" });
    }
    if (req.user.role === "admin") {
      const result = await database.query(
        "SELECT c.id, c.first_name,c.last_name, u.phone, c.created_at FROM customers c JOIN users u ON u.id=c.user_id",
      );
      return res.json(result.rows.map((row) => customerContactView(row, true)));
    }
    const barberId = customerId(req.user.profileId);
    if (!barberId) {
      return res.status(401).json({ message: "Sartarosh sessiyasi yaroqsiz" });
    }
    const result = await database.query(
      `SELECT DISTINCT c.id,c.first_name,c.last_name,c.created_at
       FROM customers c
       JOIN bookings b ON b.customer_id=c.id
       WHERE b.barber_id=$1
      `,
      [barberId],
    );
    // Explicit allowlist prevents a future SELECT * from exposing contacts.
    return res.json(result.rows.map((row) => customerContactView(row)));
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}
// Yangi mijozni ro'yhatdan utqazish
function registerCustomer(req, res) {
  return registrationRequired(req, res);
}
// Login
const loginCustomer = require("../services/loginAuthentication").createRoleLogin("customer", pool);
// Tizimga kirgan mijoz ma'lumotlarini olish
async function getMyProfile(req, res) {
  if (typeof res.set === "function") res.set("Cache-Control", "no-store");
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({
        message: "Faqat mijoz o'z profilini ko'ra oladi",
      });
    }
    const result = await pool.query(
      "SELECT c.id,c.first_name,c.last_name,c.avatar_url,c.address,c.latitude,c.longitude,u.phone,c.created_at FROM customers c JOIN users u ON u.id=c.user_id WHERE u.id=$1",
      [req.user.accountId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Mijoz topilmadi",
      });
    }
    return res.status(200).json({
      customer: result.rows[0],
    });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}
// Bitta mijozni id orqali olish
async function takeCustomerById(req, res, _next, database = pool) {
  if (typeof res.set === "function") res.set("Cache-Control", "no-store");
  try {
    const id = customerId(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "ID noto'g'ri",
      });
    }

    if (!req.user) {
      return res.status(401).json({
        message: "Tizimga kirish talab qilinadi",
      });
    }

    if (req.user.role !== "admin" && req.user.role !== "barber") {
      return res.status(403).json({
        message: "Faqat admin yoki barber ruxsatiga ega",
      });
    }

    // Barber faqat bron orqali bog'langan mijozni ko'radi
    if (req.user.role === "barber") {
      const barberId = customerId(req.user.profileId);
      if (!barberId) {
        return res.status(401).json({ message: "Sartarosh sessiyasi yaroqsiz" });
      }
      const booking = await database.query(
        `SELECT 1
         FROM bookings
         WHERE customer_id = $1
           AND barber_id = $2
         LIMIT 1`,
        [id, barberId],
      );

      if (booking.rowCount === 0) {
        return res.status(403).json({
          message: "Bu mijozni ko'rishga ruxsatingiz yo'q",
        });
      }
    }

    // Admin uchun bron tekshiruvi talab qilinmaydi
    const isAdmin = req.user.role === "admin";
    const result = await database.query(isAdmin
      ? `SELECT c.id, c.first_name,c.last_name,u.phone,c.created_at
         FROM customers c JOIN users u ON u.id=c.user_id WHERE c.id=$1`
      : `SELECT c.id,c.first_name,c.last_name,c.created_at
         FROM customers c WHERE c.id=$1`,
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Mijoz topilmadi",
      });
    }

    return res.json(customerContactView(result.rows[0], isAdmin));
  } catch (error) {
    console.error("Customer detail lookup failed", error.code || "internal_error");
    return res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
}
// Yangi mijoz qo'shish
function addCustomer(req, res) {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Faqat admin uchun" });
  return registrationRequired(req, res);
}

// Mijoz ma'lumotlarini yangilash
async function refreshData(req, res, _next, database = pool) {
  try {
    const id = Number(req.params.id);

    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Customer emas" });
    }
    if (id !== req.user.profileId) {
      return res.status(403).json({ message: "Id mos emas" });
    }

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "ID noto'g'ri",
      });
    }

    const body = req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) return res.status(400).json({ message: "Profil ma’lumotlari noto‘g‘ri." });
    const allowed = new Set(["first_name", "firstName", "last_name", "lastName", "avatar_url", "avatarPhoto", "address", "location"]);
    if (Object.keys(body).some((key) => !allowed.has(key))) return res.status(400).json({ message: "Profil so‘rovida noma’lum maydon bor." });
    const profileNames = names(body.first_name ?? body.firstName, body.last_name ?? body.lastName);
    const patch = { first_name: profileNames.first, last_name: profileNames.last };
    if (Object.hasOwn(body, "address")) {
      if (body.address !== null && typeof body.address !== "string") return res.status(400).json({ message: "Manzil matn bo‘lishi kerak." });
      const address = typeof body.address === "string" ? body.address.trim() : null;
      if (address?.length > 500) return res.status(400).json({ message: "Manzil 500 belgidan oshmasin." });
      patch.address = address || null;
    }
    const avatar = Object.hasOwn(body, "avatar_url") ? body.avatar_url : body.avatarPhoto;
    if (Object.hasOwn(body, "avatar_url") || Object.hasOwn(body, "avatarPhoto")) {
      if (Object.hasOwn(body, "avatar_url") && Object.hasOwn(body, "avatarPhoto")) return res.status(400).json({ message: "Avatar maydoni takroran yuborildi." });
      if (avatar !== null && typeof avatar !== "string") return res.status(400).json({ message: "Avatar manzili noto‘g‘ri." });
      if (typeof avatar === "string" && avatar.startsWith("data:")) {
        const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(avatar);
        if (!match || avatar.length > 900000) return res.status(400).json({ message: "Avatar JPEG formati yoki hajmi noto‘g‘ri." });
        const decoded = Buffer.from(match[1], "base64");
        if (!decoded.length || decoded.toString("base64") !== match[1]) return res.status(400).json({ message: "Avatar JPEG formati noto‘g‘ri." });
      } else if (typeof avatar === "string") {
        let parsed;
        try { parsed = new URL(avatar); } catch { return res.status(400).json({ message: "Avatar manzili noto‘g‘ri." }); }
        if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || avatar.length > 2048) return res.status(400).json({ message: "Avatar manzili noto‘g‘ri." });
        patch.avatar_url = parsed.href;
      }
      if (avatar === null) patch.avatar_url = null;
      if (typeof avatar === "string" && avatar.startsWith("data:")) patch.avatar_url = avatar;
    }
    if (Object.hasOwn(body, "location")) {
      const location = body.location;
      if (location === null) {
        patch.latitude = null; patch.longitude = null;
      } else if (location && typeof location === "object" && !Array.isArray(location)
        && Number.isFinite(location.lat) && Number.isFinite(location.lng)
        && Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180) {
        patch.latitude = location.lat; patch.longitude = location.lng;
      } else return res.status(400).json({ message: "Joylashuv koordinatalari noto‘g‘ri." });
    }

    const entries = Object.entries(patch);
    const values = entries.map(([, value]) => value);
    values.push(id);
    const result = await database.query(
      `UPDATE customers SET ${entries.map(([column], index) => `${column}=$${index + 1}`).join(", ")}
       WHERE id=$${values.length}
       RETURNING id,first_name,last_name,avatar_url,address,latitude,longitude,created_at`,
      values,
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Mijoz topilmadi",
      });
    }

    return res.json({
      message: "Mijoz ma'lumotlari yangilandi",
      data: result.rows[0],
    });
  } catch (error) {
    if (error instanceof RegistrationError) return res.status(error.status).json({ message: error.message, code: error.code });

    if (error.code === "23505") {
      return res.status(409).json({
        message: "Bu telefon raqami allaqachon band",
      });
    }

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}

// Mijozni o'chirish
async function deleteCustomer(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "ID noto'g'ri",
      });
    }

    await accountDeletion.deleteAccount({ actor: req.user, profileId: id, role: "customer" });

    return res.json({
      message: "Mijoz o'chirildi",
    });
  } catch (error) {
    if (error instanceof AccountDeletionError) return res.status(error.status).json({ message: error.message, code: error.code });
    console.error("deleteCustomer xatosi:", error.code || "internal_error");

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}

module.exports = {
  getCustomers,
  takeCustomerById,
  deleteCustomer,
  refreshData,
  addCustomer,
  registerCustomer,
  loginCustomer,
  getMyProfile,
};
