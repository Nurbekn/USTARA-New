const pool = require("../db");
const { registrationRequired } = require("./registrationController");
const { createAccountDeletionService, AccountDeletionError } = require("../services/accountDeletionService");
const { BarberProfileError, normalizeBarberProfilePatch, createBarberProfileService } = require("../services/barberProfile");
const accountDeletion = createAccountDeletionService(pool);
const {invalidActiveBooking} = require('../services/calendarSchedule');
// Barcha sartaroshlarni olish
function exploreBarber(row) {
  const location = Number.isFinite(row.latitude) && Number.isFinite(row.longitude)
    ? { lat: row.latitude, lng: row.longitude }
    : null;
  const startingPrice = row.starting_price == null ? null : Number(row.starting_price);
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    specialty: row.specialty,
    salonName: row.salon_name,
    address: row.address,
    location,
    avatarPhoto: row.avatar_url,
    startingPrice: Number.isFinite(startingPrice) ? startingPrice : null,
    serviceIds: Array.isArray(row.service_ids) ? row.service_ids : [],
    services: Array.isArray(row.services) ? row.services : [],

  };
}

function createBarberDirectoryHandler(database = pool) {
  return async function getBarbers(_req, res) {
    // Public service prices, active services and coordinates are mutable.
    // Do not serve an outdated directory snapshot as a fresh booking option.
    res.set("Cache-Control", "no-store");
    try {
      const result = await database.query(
        `SELECT b.id,b.first_name,b.last_name,b.specialty,b.salon_name,b.address,
                b.latitude,b.longitude,b.avatar_url,
                service_summary.starting_price,service_summary.service_ids,service_summary.services
         FROM barbers b
         JOIN users u ON u.id=b.user_id AND u.role=$2
         LEFT JOIN LATERAL (
           SELECT MIN(s.price)::double precision AS starting_price,
                  COALESCE(array_agg(s.id ORDER BY s.id),ARRAY[]::integer[]) AS service_ids,
                  COALESCE(
                    json_agg(json_build_object(
                      'id',s.id,
                      'name',s.name,
                      'description',NULL,
                      'category',NULL,
                      'minPrice',s.price::double precision,
                      'maxPrice',s.price::double precision,
                      'barberIds',json_build_array(s.barber_id),
                      'salonIds','[]'::json
                    ) ORDER BY s.id),
                    '[]'::json
                  ) AS services
           FROM services s
           WHERE s.barber_id=b.id AND COALESCE((to_jsonb(s)->>'is_active')::boolean,TRUE)
         ) AS service_summary ON TRUE
         WHERE b.verification_status=$1
         ORDER BY b.created_at DESC,b.id DESC`,
        ["approved", "barber"],
      );
      return res.json(result.rows.map(exploreBarber));
    } catch (error) {
      console.error(error.message);
      return res.status(500).json({ message: "Serverda xatolik yuz berdi" });
    }
  };
}

const getBarbers = createBarberDirectoryHandler(pool);

// Tasdiqlanishi kutilayotgan sartaroshlarni olish
async function getPendingBarbers(req, res) {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Faqat admin kira oladi",
      });
    }

    const result = await pool.query(
      `SELECT b.id,b.first_name,b.last_name,u.phone,b.created_at,b.verification_status
       FROM barbers b JOIN users u ON u.id=b.user_id
       WHERE b.verification_status=$1
       ORDER BY b.created_at DESC`,
      ["pending"],
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("getPendingBarbers xatosi:", error.message);

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}

function profileId(value) {
  const id = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function createBarberProfileHandlers(database = pool) {
  const profiles = createBarberProfileService(database);
  return {
    async takeBarberById(req, res) {
      const id = profileId(req.params?.id);
      if (!id) return res.status(400).json({ message: "Sartarosh ID noto‘g‘ri", code: "invalid_barber_id" });
      try {
        const barber = await profiles.getPublic(id);
        if (!barber) return res.status(404).json({ message: "Tasdiqlangan sartarosh topilmadi" });
        const publicFields = [
          "id", "first_name", "last_name", "salon_name", "address", "latitude",
          "longitude", "experience_years", "bio", "avatar_url", "certificates", "specialty", "phone",
        ];
        return res.json(Object.fromEntries(publicFields.map((field) => [field, barber[field]])));
      } catch {
        return res.status(500).json({ message: "Serverda xatolik yuz berdi" });
      }
    },
    async getMyBarberProfile(req, res) {
      if (req.user?.role !== "barber") return res.status(403).json({ message: "Faqat barber o‘z profilini ko‘ra oladi" });
      const barberId = profileId(req.user.profileId);
      const accountId = profileId(req.user.accountId);
      if (!barberId || !accountId) return res.status(401).json({ message: "Barber sessiyasi yaroqsiz" });
      try {
        const barber = await profiles.getOwn(barberId, accountId);
        if (!barber) return res.status(404).json({ message: "Barber profili topilmadi" });
        return res.status(200).json({ barber });
      } catch {
        return res.status(500).json({ message: "Serverda xatolik yuz berdi" });
      }
    },
    async refreshData(req, res) {
      if (req.user?.role !== "barber") return res.status(403).json({ message: "Faqat barber o‘z profilini yangilashi mumkin" });
      const id = profileId(req.params?.id);
      const profileIdentity = profileId(req.user.profileId);
      const accountId = profileId(req.user.accountId);
      if (!id || !profileIdentity || !accountId) return res.status(400).json({ message: "Barber ID yoki sessiya noto‘g‘ri" });
      if (id !== profileIdentity) return res.status(403).json({ message: "Faqat o‘z profilingizni yangilashingiz mumkin" });
      let body = req.body;
      if (body && typeof body === "object" && !Array.isArray(body) && Object.hasOwn(body, "phone")) {
        let current;
        try { current = await profiles.getOwn(id, accountId); }
        catch { return res.status(500).json({ message: "Profilni tekshirishda server xatoligi yuz berdi" }); }
        if (!current) return res.status(404).json({ message: "Barber profili topilmadi" });
        if (body.phone !== current.phone) {
          return res.status(403).json({ message: "Telefon raqamini profil orqali o‘zgartirib bo‘lmaydi", code: "phone_change_forbidden" });
        }
        body = { ...body };
        delete body.phone;
      }
      let patch;
      try { patch = normalizeBarberProfilePatch(body); }
      catch (error) {
        if (error instanceof BarberProfileError) return res.status(error.status).json({ message: error.message, code: error.code });
        return res.status(400).json({ message: "Profil ma’lumotlari noto‘g‘ri", code: "invalid_profile" });
      }
      try {
        const barber = await profiles.update(id, accountId, patch);
        if (!barber) return res.status(404).json({ message: "Barber profili topilmadi" });
        return res.json({ message: "Barber profili yangilandi", data: barber });
      } catch {
        return res.status(500).json({ message: "Profilni saqlashda server xatoligi yuz berdi" });
      }
    },
  };
}

const barberProfileHandlers = createBarberProfileHandlers(pool);
const { takeBarberById, getMyBarberProfile } = barberProfileHandlers;

// Yangi sartaroshni ro'yhatdan utqazish
function registerBarber(req, res) {
  return registrationRequired(req, res);
}
// Login barbers
const loginBarber = require("../services/loginAuthentication").createRoleLogin("barber", pool);
// Yangi sartarosh qo'shish
function addBarber(req, res) {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Faqat admin uchun" });
  return registrationRequired(req, res);
}
const refreshData = barberProfileHandlers.refreshData;
// Sartaroshni o'chirish
async function deleteBarber(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "ID kiritishda xatolik",
      });
    }
    await accountDeletion.deleteAccount({ actor: req.user, profileId: id, role: "barber" });
    return res.json({
      message: "Sartarosh o'chirildi",
    });
  } catch (error) {
    if (error instanceof AccountDeletionError) return res.status(error.status).json({ message: error.message, code: error.code });
    console.error("deleteBarber xatosi:", error.code || "internal_error");
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}
// Sartoroshni verification qilish
async function verifyBarber(req, res) {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Faqat admin sartaroshni tasdiqlashi mumkin",
    });
  }

  const barberId = Number(req.params.id);
  const { status } = req.body;
  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({
      message: "Status approved toki rejected bo'lishi kerak",
    });
  }
  if (!Number.isInteger(barberId) || barberId <= 0) {
    return res.status(400).json({
      message: "Sartarosh ID noto'g'ri",
    });
  }
  try {
    const result = await pool.query(
      `UPDATE barbers b
       SET verification_status=$1
       WHERE b.id=$2
       RETURNING b.id,b.first_name,b.last_name,b.verification_status
      `,
      [status, barberId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Sartarosh topilmadi",
      });
    }
    return res.status(200).json({
      message:
        status === "approved"
          ? "Sartarosh muvaffaqiyatli tasdiqlandi"
          : "Sartarosh arizasi rad etildi",
      barber: result.rows[0],
    });
  } catch (error) {
    console.error("verifyBarber error:", error);

    return res.status(500).json({
      message: "Server xatosi",
    });
  }
}
//Ish vaqtini qushish
async function setWorkingHours(req, res, _next, database = pool) {
  let client;
  let transactionStarted = false;

  try {
    // 1. Faqat barber ish jadvalini o'zgartirishi mumkin
    if (req.user.role !== "barber") {
      return res.status(403).json({
        message: "Faqat barber ish jadvalini o'zgartira oladi",
      });
    }
    const { working_hours } = req.body;

    // 2. Array ekanini tekshiramiz
    if (!Array.isArray(working_hours)) {
      return res.status(400).json({
        message: "working_hours array bo'lishi kerak",
      });
    }

    if (working_hours.length === 0) {
      return res.status(400).json({
        message: "Kamida bitta ish kuni yuborilishi kerak",
      });
    }

    // 3. Har bir element obyekt ekanini tekshiramiz
    for (const day of working_hours) {
      if (!day || typeof day !== "object" || Array.isArray(day)) {
        return res.status(400).json({
          message: "Har bir kun obyekt bo'lishi kerak",
        });
      }
    }

    // 4. Takroriy kunlarni tekshiramiz
    const days = working_hours.map((day) => day.day_of_week);
    const uniqueDays = new Set(days);

    if (days.length !== uniqueDays.size) {
      return res.status(400).json({
        message: "Bir kunni ikki marta yuborish mumkin emas",
      });
    }

    // 5. Har bir kun va vaqtni tekshiramiz
    for (const day of working_hours) {
      if (
        !Number.isInteger(day.day_of_week) ||
        day.day_of_week < 0 ||
        day.day_of_week > 6
      ) {
        return res.status(400).json({
          message: "Hafta kuni 0 dan 6 gacha butun son bo'lishi kerak",
        });
      }

      if (
        typeof day.start_time !== "string" ||
        typeof day.end_time !== "string"
      ) {
        return res.status(400).json({
          message: "Boshlanish va tugash vaqti string bo'lishi kerak",
        });
      }

      const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

      if (
        !timePattern.test(day.start_time) ||
        !timePattern.test(day.end_time)
      ) {
        return res.status(400).json({
          message: "Vaqt HH:MM formatida bo'lishi kerak",
        });
      }

      const [hour, minute] = day.start_time.split(":").map(Number);
      const [hourEnd, minuteEnd] = day.end_time.split(":").map(Number);

      const startTotal = hour * 60 + minute;
      const endTotal = hourEnd * 60 + minuteEnd;

      if (startTotal >= endTotal) {
        return res.status(400).json({
          message: "Boshlanish vaqti tugash vaqtidan oldin bo'lishi kerak",
        });
      }
    }

    // 6. Bazaga ulanamiz
    client = await database.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    // Serialize schedule replacement with booking creation, including days
    // which have no row yet (row locks alone cannot protect that gap).
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SELECT pg_advisory_xact_lock($1)", [req.user.profileId]);

    const barberResult = await client.query(
      "SELECT id,verification_status FROM barbers WHERE id=$1 FOR SHARE",
      [req.user.profileId],
    );
    if (barberResult.rowCount === 0) {
      await client.query("ROLLBACK"); transactionStarted = false;
      return res.status(404).json({ message: "Barber topilmadi" });
    }
    if (barberResult.rows[0].verification_status !== "approved") {
      await client.query("ROLLBACK"); transactionStarted = false;
      return res.status(403).json({ message: "Ish jadvalini o'zgartirish uchun admin tasdig'i kerak" });
    }

    // 7. Eski ish jadvalini o'chiramiz
    await client.query(
      "DELETE FROM barber_working_hours WHERE barber_id = $1",
      [req.user.profileId],
    );

    // 8. Yangi ish jadvalini saqlaymiz
    for (const day of working_hours) {
      await client.query(
        `INSERT INTO barber_working_hours
          (barber_id, day_of_week, start_time, end_time)
         VALUES ($1, $2, $3, $4)`,
        [req.user.profileId, day.day_of_week, day.start_time, day.end_time],
      );
    }

    // A new weekly schedule must not silently invalidate a confirmed booking.
    // Same barber advisory lock as all booking creation/reschedule flows.
    const conflictingBooking = await invalidActiveBooking(client, req.user.profileId);
    if (conflictingBooking !== null) {
      await client.query("ROLLBACK"); transactionStarted = false;
      return res.status(409).json({
        code: 'existing_booking_conflict',
        message: "Jadvalni o‘zgartirib bo‘lmaydi: kelajakdagi tasdiqlangan bron yangi soatlarga sig‘maydi. Avval bronni mijoz bilan kelishib ko‘chiring.",
      });
    }
    // 9. Barcha amallar muvaffaqiyatli
    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(200).json({
      message: "Ish vaqtlari muvaffaqiyatli saqlandi",
    });
  } catch (error) {
    console.error("setWorkingHours xatosi:", error.message);

    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("ROLLBACK xatosi:", rollbackError.message);
      }
    }

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}
//Haftalik jadvalni qaytarish
async function getPublicWorkingHours(req, res, _next, database = pool) {
  const id = profileId(req.params.id);
  if (!id) return res.status(404).json({ message: "Sartarosh topilmadi." });
  try {
    const result = await database.query(`SELECT b.id,COALESCE(json_agg(json_build_object(
      'day_of_week',h.day_of_week,'start_time',h.start_time,'end_time',h.end_time)
      ORDER BY h.day_of_week) FILTER (WHERE h.id IS NOT NULL),'[]'::json) AS hours
      FROM barbers b JOIN users u ON u.id=b.user_id AND u.role='barber' AND u.deactivated_at IS NULL
      LEFT JOIN barber_working_hours h ON h.barber_id=b.id
      WHERE b.id=$1 AND b.verification_status='approved' GROUP BY b.id`, [id]);
    if (!result.rowCount) return res.status(404).json({ message: "Sartarosh topilmadi." });
    res.set('Cache-Control','no-store');
    return res.json(result.rows[0].hours);
  } catch { return res.status(503).json({ message: "Ish jadvalini yuklab bo‘lmadi." }); }
}

async function getWorkingHours(req, res) {
  try {
    if (req.user.role !== "barber") {
      return res.status(403).json({ message: "Faqat barber o'z ish jadvalini ko'ra oladi" });
    }
    const barberId = req.user.profileId;

    const result = await pool.query(
      `SELECT day_of_week,start_time,end_time
       FROM barber_working_hours
       WHERE barber_id=$1
       ORDER BY day_of_week
      `,
      [barberId],
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("getWorkingHours xatosi:", error.message);

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}

async function setBookingAcceptance(req, res, _next, database = pool) {
  let client;
  let transactionStarted = false;
  try {
    if (req.user?.role !== "barber") {
      return res.status(403).json({ message: "Faqat barber bron qabul qilish holatini o‘zgartira oladi" });
    }
    const barberId = profileId(req.user.profileId);
    if (!barberId) return res.status(401).json({ message: "Barber sessiyasi yaroqsiz" });
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)
        || typeof req.body.accepting_bookings !== "boolean") {
      return res.status(400).json({
        message: "accepting_bookings qiymati true yoki false bo‘lishi kerak",
        code: "invalid_accepting_bookings",
      });
    }

    client = await database.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SELECT pg_advisory_xact_lock($1)", [barberId]);
    const barber = await client.query(
      "SELECT id FROM barbers WHERE id=$1 FOR UPDATE",
      [barberId],
    );
    if (!barber.rowCount) {
      await client.query("ROLLBACK"); transactionStarted = false;
      return res.status(404).json({ message: "Barber profili topilmadi" });
    }
    const result = await client.query(
      "UPDATE barbers SET accepting_bookings=$1 WHERE id=$2 RETURNING accepting_bookings",
      [req.body.accepting_bookings, barberId],
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK"); transactionStarted = false;
      return res.status(404).json({ message: "Barber profili topilmadi" });
    }
    await client.query("COMMIT"); transactionStarted = false;
    return res.json({
      message: "Bron qabul qilish holati yangilandi",
      data: { accepting_bookings: result.rows[0].accepting_bookings },
    });
  } catch (error) {
    if (client && transactionStarted) {
      try { await client.query("ROLLBACK"); } catch { /* birinchi xatoni saqlash */ }
    }
    console.error("setBookingAcceptance xatosi:", error.code || "internal_error");
    return res.status(500).json({ message: "Bron qabul qilish holatini saqlab bo‘lmadi" });
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  getBarbers,
  deleteBarber,
  refreshData,
  addBarber,
  takeBarberById,
  registerBarber,
  loginBarber,
  verifyBarber,
  getPendingBarbers,
  getMyBarberProfile,
  setWorkingHours,
  getWorkingHours,
  getPublicWorkingHours,
  setBookingAcceptance,
  createBarberProfileHandlers,
  createBarberDirectoryHandler,
};
