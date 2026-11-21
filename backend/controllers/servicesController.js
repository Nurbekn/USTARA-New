const pool = require("../db");
const { multiSchemaReady } = require("../services/bookingSelection");
const { bookingDbConflict } = require("../services/bookingDbConflicts");

function safeId(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value);
  if (!/^[1-9]\d*$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

function isServiceBody(body) {
  return body !== null && typeof body === "object" && !Array.isArray(body);
}

async function lockApprovedBarber(client, barberId) {
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SELECT pg_advisory_xact_lock($1)", [barberId]);
  const barber = await client.query(
    "SELECT id,verification_status FROM barbers WHERE id=$1 FOR SHARE",
    [barberId],
  );
  if (!barber.rowCount) return { status: 404 };
  if (barber.rows[0].verification_status !== "approved") return { status: 403 };
  return { status: 200 };
}

// Match services VARCHAR(50), NUMERIC(10,2) CHECK (price > 0), INTEGER > 0.
function validateServiceInput(name, price, durationMinutes) {
  if (typeof name !== "string" || name.trim() === "" || Array.from(name.trim()).length > 50) {
    return "Name kiritishda xatolik";
  }
  // PostgreSQL rounds NUMERIC to two decimals before checking its range/value.
  // Keep valid extra-decimal inputs rather than imposing a new decimal policy.
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0.005 || price >= 99999999.995) {
    return "Price kiritishda xatolik";
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 60 || durationMinutes % 5 !== 0) {
    return "Duration minutes kiritishda xatolik";
  }
  return null;
}

// Yangi xizmat qo'shish
async function addService(req, res, _next, database = pool) {
  let client;
  let inTransaction = false;
  let broken = false;
  let commitStarted = false;
  try {
    if (req.user.role !== "barber") {
      return res.status(403).json({ message: "Barber emas" });
    }
    const barber_id = req.user.profileId;
    if (!isServiceBody(req.body)) {
      return res.status(400).json({ message: "So'rov ma'lumotlari obyekt bo'lishi kerak", code: "invalid_body" });
    }
    const { name, price, duration_minutes } = req.body;

    const validationError = validateServiceInput(name, price, duration_minutes);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    if (
      typeof barber_id !== "number" ||
      !Number.isInteger(barber_id) ||
      barber_id <= 0
    ) {
      return res.status(400).json({
        message: "Barber ID kiritishda xatolik",
      });
    }

    client = await database.connect();
    await client.query("BEGIN");
    inTransaction = true;
    const access = await lockApprovedBarber(client, barber_id);
    if (access.status !== 200) {
      await client.query("ROLLBACK"); inTransaction = false;
      return res.status(access.status).json({ message: access.status === 404
        ? "Barber topilmadi"
        : "Xizmat qo'shish uchun sartarosh tasdiqlangan bo'lishi kerak" });
    }

    const result = await client.query(
      `INSERT INTO services (name, price, duration_minutes, barber_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name.trim(), price, duration_minutes, barber_id],
    );
    commitStarted = true; await client.query("COMMIT"); inTransaction = false;

    return res.status(201).json({
      message: "Xizmat yaratildi",
      data: result.rows[0],
    });
  } catch (error) {
    // COMMIT network failure can leave outcome unknown: never reuse this client.
    if (commitStarted) broken = true;
    if (client && inTransaction) {
      try { await client.query("ROLLBACK"); } catch { broken = true; }
    }
    const retry = bookingDbConflict(error);
    if (retry) return res.status(retry.status).json({ message: retry.message, code: retry.code });
    console.error(error.message);
    return res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  } finally {
    if (client) client.release(broken);
  }
}

// Public discovery exposes only approved barbers' active service catalog.
// Never return owner-only fields, inactive services, client information or JWT.
function createPublicServicesHandler(database = pool) {
  return async function getPublicServices(req, res) {
    const barberId = safeId(req.query?.barber_id);
    if (barberId === null) {
      return res.status(400).json({ code: 'invalid_barber_id', message: 'Sartarosh ID noto‘g‘ri.' });
    }
    try {
      const result = await database.query(`SELECT s.id,s.name,s.price,s.duration_minutes,s.barber_id
        FROM services s JOIN barbers b ON b.id=s.barber_id
        JOIN users u ON u.id=b.user_id
        WHERE b.id=$1 AND b.verification_status='approved'
          AND u.role='barber' AND u.deactivated_at IS NULL
          AND COALESCE((to_jsonb(s)->>'is_active')::boolean,TRUE)
        ORDER BY s.id`, [barberId]);
      res.set('Cache-Control', 'no-store');
      return res.json(result.rows);
    } catch {
      return res.status(503).json({ message: 'Xizmatlar ro‘yxatini yuklab bo‘lmadi.' });
    }
  };
}
const getPublicServices = createPublicServicesHandler(pool);

// Sartarosh xizmatlarini olish
async function getSevices(req, res, _next, database = pool) {
  if (typeof res.set === 'function') res.set('Cache-Control', 'no-store');
  try {
    const barberId = safeId(req.query?.barber_id);

    if (barberId === null) {
      return res.status(400).json({
        message: "Barber ID kiritishda xatolik",
      });
    }

    const result = await database.query(
      `SELECT id, name, price, duration_minutes, barber_id, COALESCE((to_jsonb(services)->>'is_active')::boolean,TRUE) AS is_active
       FROM services
       WHERE barber_id = $1 AND ($2::boolean OR COALESCE((to_jsonb(services)->>'is_active')::boolean,TRUE))`,
      [barberId, req.user?.role === 'barber' && req.user.profileId === barberId],
    );

    return res.json(result.rows);
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}

// Single-service lookup never exposes inactive services or another owner's private catalog.
async function getServiceById(req, res, _next, database = pool) {
  const id = safeId(req.params?.id);
  if (id === null) return res.status(400).json({ message: "ID kiritishda xatolik" });
  try {
    const result = await database.query(
      `SELECT s.id,s.name,s.price,s.duration_minutes,s.barber_id,
              COALESCE((to_jsonb(s)->>'is_active')::boolean,TRUE) AS is_active
       FROM services s JOIN barbers b ON b.id=s.barber_id
       JOIN users u ON u.id=b.user_id
       WHERE s.id=$1 AND (
         (s.barber_id=$2 AND $3::boolean)
         OR (b.verification_status='approved' AND u.role='barber'
             AND u.deactivated_at IS NULL
             AND COALESCE((to_jsonb(s)->>'is_active')::boolean,TRUE)))`,
      [id, req.user?.role === 'barber' ? req.user.profileId : null, req.user?.role === 'barber'],
    );
    if (!result.rowCount) return res.status(404).json({ message: "Xizmat topilmadi" });
    const { is_active, ...service } = result.rows[0];
    const owner = req.user?.role === 'barber' && req.user.profileId === service.barber_id;
    res.set('Cache-Control', 'no-store');
    return res.json(owner ? { ...service, is_active } : service);
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
}

// Xizmat ma'lumotlarini yangilash
async function refreshServiceData(req, res, _next, database = pool) {
  let client;
  let inTransaction = false;
  let broken = false;
  let commitStarted = false;
  try {
    const id = safeId(req.params?.id);
    if (req.user?.role !== "barber") return res.status(403).json({ message: "Barber emas" });
    if (!isServiceBody(req.body)) {
      return res.status(400).json({ message: "So'rov ma'lumotlari obyekt bo'lishi kerak", code: "invalid_body" });
    }
    const { name, price, duration_minutes } = req.body;
    const barber_id = req.user.profileId;

    if (id === null) {
      return res.status(400).json({
        message: "ID kiritishda xatolik",
      });
    }

    const validationError = validateServiceInput(name, price, duration_minutes);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    client = await database.connect();
    await client.query("BEGIN");
    inTransaction = true;
    const access = await lockApprovedBarber(client, barber_id);
    if (access.status !== 200) {
      await client.query("ROLLBACK"); inTransaction = false;
      return res.status(access.status).json({ message: access.status === 404
        ? "Barber topilmadi"
        : "Bu amal uchun tasdiqlangan sartarosh bo'lishi kerak" });
    }
    if (req.body.is_active !== undefined) {
      if (typeof req.body.is_active !== 'boolean') { await client.query('ROLLBACK'); inTransaction = false; return res.status(400).json({ message: 'Xizmat holati noto‘g‘ri.' }); }
      if (!await multiSchemaReady(client)) { await client.query('ROLLBACK'); inTransaction = false; return res.status(503).json({ message: 'Xizmat holatini boshqarish hali yoqilmagan.', code: 'migration_required' }); }
      await client.query('UPDATE services SET is_active=$1 WHERE id=$2 AND barber_id=$3', [req.body.is_active, id, barber_id]);
    }
    const result = await client.query(
      `UPDATE services
       SET name = $1, price = $2, duration_minutes = $3
       WHERE id = $4 AND barber_id=$5
       RETURNING *`,
      [name.trim(), price, duration_minutes, id, barber_id],
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK"); inTransaction = false;
      return res.status(404).json({
        message: "Xizmat topilmadi",
      });
    }
    commitStarted = true; await client.query("COMMIT"); inTransaction = false;

    return res.json({
      message: "Xizmat ma'lumotlari yangilandi",
      data: result.rows[0],
    });
  } catch (error) {
    // COMMIT network failure can leave outcome unknown: never reuse this client.
    if (commitStarted) broken = true;
    if (client && inTransaction) {
      try { await client.query("ROLLBACK"); } catch { broken = true; }
    }
    const retry = bookingDbConflict(error);
    if (retry) return res.status(retry.status).json({ message: retry.message, code: retry.code });
    console.error(error.message);

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  } finally { if (client) client.release(broken); }
}

// Xizmatni o'chirish
async function deleteService(req, res, _next, database = pool) {
  let client;
  let inTransaction = false;
  let broken = false;
  let commitStarted = false;
  try {
    const id = safeId(req.params?.id);
    const barber_id = req.user.profileId;
    if (req.user.role !== "barber") {
      return res.status(403).json({ message: "Barber emas" });
    }
    if (id === null) {
      return res.status(400).json({
        message: "ID kiritishda xatolik",
      });
    }
    client = await database.connect();
    await client.query("BEGIN");
    inTransaction = true;
    const access = await lockApprovedBarber(client, barber_id);
    if (access.status !== 200) {
      await client.query("ROLLBACK"); inTransaction = false;
      return res.status(access.status).json({ message: access.status === 404
        ? "Barber topilmadi"
        : "Bu amal uchun tasdiqlangan sartarosh bo'lishi kerak" });
    }
    const result = await client.query(
      "DELETE FROM services WHERE id = $1 AND barber_id=$2",
      [id, barber_id],
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK"); inTransaction = false;
      return res.status(404).json({
        message: "Xizmat topilmadi",
      });
    }
    commitStarted = true; await client.query("COMMIT"); inTransaction = false;

    return res.json({
      message: "Xizmat o'chirildi",
    });
  } catch (error) {
    // COMMIT network failure can leave outcome unknown: never reuse this client.
    if (commitStarted) broken = true;
    if (client && inTransaction) {
      try { await client.query("ROLLBACK"); } catch { broken = true; }
    }
    // A referenced service is never hard-deleted: guide the owner to archive.
    if (error.code === "23503") {
      return res.status(409).json({
        code: 'service_has_bookings',
        message: "Xizmatga bog'langan bronlar bor. Xizmatni yashirish mumkin.",
      });
    }
    const retry = bookingDbConflict(error);
    if (retry) return res.status(retry.status).json({ message: retry.message, code: retry.code });
    console.error(error.message);
    return res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  } finally { if (client) client.release(broken); }
}

// Explicit archive/reactivate operation: never deletes referenced bookings.
// Retains the same advisory lock order as edits, account deletion and booking writes.
async function setServiceStatus(req, res, _next, database = pool) {
  const id = safeId(req.params?.id);
  if (req.user?.role !== 'barber') return res.status(403).json({ code: 'barber_required', message: 'Faqat sartarosh uchun.' });
  if (id === null || safeId(req.user.profileId) === null) return res.status(400).json({ code: 'invalid_service_id', message: 'Xizmat ID noto‘g‘ri.' });
  if (!isServiceBody(req.body) || typeof req.body.is_active !== 'boolean' ||
      Object.keys(req.body).some(key => key !== 'is_active')) {
    return res.status(400).json({ code: 'invalid_service_status', message: 'is_active boolean bo‘lishi kerak.' });
  }
  let client; let transaction = false; let broken = false; let commitStarted = false;
  try {
    client = await database.connect();
    await client.query('BEGIN'); transaction = true;
    const access = await lockApprovedBarber(client, req.user.profileId);
    if (access.status !== 200) {
      await client.query('ROLLBACK'); transaction = false;
      return res.status(access.status).json({ code: 'barber_unavailable', message: 'Tasdiqlangan sartarosh topilmadi.' });
    }
    if (!await multiSchemaReady(client)) {
      await client.query('ROLLBACK'); transaction = false;
      return res.status(503).json({ code: 'migration_required', message: 'Xizmat holatini boshqarish mavjud emas.' });
    }
    const updated = await client.query(
      'UPDATE services SET is_active=$1 WHERE id=$2 AND barber_id=$3 RETURNING id,barber_id,is_active',
      [req.body.is_active, id, req.user.profileId]
    );
    if (!updated.rowCount) {
      await client.query('ROLLBACK'); transaction = false;
      return res.status(404).json({ code: 'service_not_found', message: 'Xizmat topilmadi.' });
    }
    commitStarted = true; await client.query('COMMIT'); transaction = false;
    res.set('Cache-Control', 'no-store');
    return res.json({ message: req.body.is_active ? 'Xizmat faollashtirildi' : 'Xizmat yashirildi', data: updated.rows[0] });
  } catch (error) {
    // COMMIT network failure can leave outcome unknown: never reuse this client.
    if (commitStarted) broken = true;
    if (client && transaction) { try { await client.query('ROLLBACK'); } catch { broken = true; } }
    const retry = bookingDbConflict(error);
    if (retry) return res.status(retry.status).json({ message: retry.message, code: retry.code });
    console.error(error.message);
    return res.status(500).json({ code: 'service_status_failed', message: 'Xizmat holatini yangilab bo‘lmadi.' });
  } finally { if (client) client.release(broken); }
}
module.exports = {
  setServiceStatus,
  getSevices,
  getServiceById,
  refreshServiceData,
  deleteService,
  addService,
  getPublicServices,
  createPublicServicesHandler,
  safeId,
};
