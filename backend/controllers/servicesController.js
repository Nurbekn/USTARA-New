const pool = require("../db");

// Yangi xizmat qo'shish
async function addService(req, res) {
  try {
    if (req.user.role !== "barber") {
      return res.status(403).json({ message: "Barber emas" });
    }
    const barber_id = req.user.id;
    const { name, price, duration_minutes } = req.body;

    if (typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({
        message: "Name kiritishda xatolik",
      });
    }

    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      return res.status(400).json({
        message: "Price kiritishda xatolik",
      });
    }

    if (
      typeof duration_minutes !== "number" ||
      !Number.isInteger(duration_minutes) ||
      duration_minutes <= 0
    ) {
      return res.status(400).json({
        message: "Duration minutes kiritishda xatolik",
      });
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

    const barber = await pool.query(
      "SELECT id,verification_status FROM barbers WHERE id = $1",
      [barber_id],
    );

    if (barber.rowCount === 0) {
      return res.status(404).json({
        message: "Barber topilmadi",
      });
    }
    if (barber.rows[0].verification_status !== "approved") {
      return res.status(403).json({
        message: "Xizmat qo'shish uchun sartarosh tasdiqlangan bo'lishi kerak",
      });
    }

    const result = await pool.query(
      `INSERT INTO services (name, price, duration_minutes, barber_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name.trim(), price, duration_minutes, barber_id],
    );

    return res.status(201).json({
      message: "Xizmat yaratildi",
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}

// Sartarosh xizmatlarini olish
async function getSevices(req, res) {
  try {
    const barberId = Number(req.query.barber_id);

    if (!req.query.barber_id || !Number.isInteger(barberId) || barberId <= 0) {
      return res.status(400).json({
        message: "Barber ID kiritishda xatolik",
      });
    }

    const result = await pool.query(
      `SELECT id, name, price, duration_minutes, barber_id
       FROM services
       WHERE barber_id = $1`,
      [barberId],
    );

    return res.json(result.rows);
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}

// Bitta xizmatni id orqali olish
async function getServiceById(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "ID kiritishda xatolik",
      });
    }

    const result = await pool.query("SELECT * FROM services WHERE id = $1", [
      id,
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Xizmat topilmadi",
      });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}

// Xizmat ma'lumotlarini yangilash
async function refreshServiceData(req, res) {
  try {
    const id = Number(req.params.id);
    const { name, price, duration_minutes } = req.body;
    const barber_id = req.user.id;

    const barberCheck = await pool.query(
      `SELECT verification_status
       FROM barbers
       WHERE id=$1
      `,
      [req.user.id],
    );
    if (
      barberCheck.rowCount === 0 ||
      barberCheck.rows[0].verification_status !== "approved"
    ) {
      return res.status(403).json({
        message: "Bu amal uchun tasdiqlangan sartarosh bulishi kerak",
      });
    }
    if (req.user.role !== "barber") {
      return res.status(403).json({ message: "Barber emas" });
    }

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "ID kiritishda xatolik",
      });
    }

    if (typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({
        message: "Name kiritishda xatolik",
      });
    }

    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      return res.status(400).json({
        message: "Price kiritishda xatolik",
      });
    }

    if (
      typeof duration_minutes !== "number" ||
      !Number.isInteger(duration_minutes) ||
      duration_minutes <= 0
    ) {
      return res.status(400).json({
        message: "Duration minutes kiritishda xatolik",
      });
    }

    const result = await pool.query(
      `UPDATE services
       SET name = $1, price = $2, duration_minutes = $3
       WHERE id = $4 AND barber_id=$5
       RETURNING *`,
      [name.trim(), price, duration_minutes, id, barber_id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Xizmat topilmadi",
      });
    }

    return res.json({
      message: "Xizmat ma'lumotlari yangilandi",
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}

// Xizmatni o'chirish
async function deleteService(req, res) {
  try {
    const id = Number(req.params.id);
    const barber_id = req.user.id;

    const barberCheck = await pool.query(
      `SELECT verification_status
   FROM barbers
   WHERE id = $1`,
      [req.user.id],
    );

    if (
      barberCheck.rowCount === 0 ||
      barberCheck.rows[0].verification_status !== "approved"
    ) {
      return res.status(403).json({
        message: "Bu amal uchun tasdiqlangan sartarosh bo'lishi kerak",
      });
    }
    if (req.user.role !== "barber") {
      return res.status(403).json({ message: "Barber emas" });
    }
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "ID kiritishda xatolik",
      });
    }

    const result = await pool.query(
      "DELETE FROM services WHERE id = $1 AND barber_id=$2",
      [id, barber_id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Xizmat topilmadi",
      });
    }

    return res.json({
      message: "Xizmat o'chirildi",
    });
  } catch (error) {
    console.error(error.message);

    if (error.code === "23503") {
      return res.status(409).json({
        message: "Xizmatga bog'langan ma'lumotlar mavjud",
      });
    }

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}
module.exports = {
  getSevices,
  getServiceById,
  refreshServiceData,
  deleteService,
  addService,
};
