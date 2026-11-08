const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
// Barcha sartaroshlarni olish
async function getBarbers(req, res) {
  try {
    const result = await pool.query(
      "SELECT id, name, phone, created_at,verification_status FROM barbers WHERE verification_status='approved' ORDER BY created_at DESC",
    );

    return res.json(result.rows);
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}

// Tasdiqlanishi kutilayotgan sartaroshlarni olish
async function getPendingBarbers(req, res) {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Faqat admin kira oladi",
      });
    }

    const result = await pool.query(
      `SELECT id,name,phone,created_at,verification_status
       FROM barbers
       WHERE verification_status=$1
       ORDER BY created_at DESC`,
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

// bitta sartaroshni ID orqali olish.
async function takeBarberById(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "ID kiritishda xarolik",
      });
    }
    const result = await pool.query(
      "SELECT id,name,phone,created_at FROM barbers WHERE id=$1 AND verification_status='approved'",
      [id],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Sartarosh topilmadi",
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
// Yangi sartaroshni ro'yhatdan utqazish
async function registerBarber(req, res) {
  try {
    const { name, phone, password } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({
        message: "Ism, telefon va parol kiritilishi kerak",
      });
    }
    if (name.trim() === "" || phone.trim() === "" || password.trim() === "") {
      return res.status(400).json({
        message: "Ism,telefon va parol bo'sh bulmasligi kerak",
      });
    }
    if (password.trim().length < 8) {
      return res
        .status(400)
        .json({ message: "Parol kamida 8 ta belgidan iborat bo'lishi kerak" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO barbers (name,phone,password,verification_status) VALUES ($1,$2,$3,'pending') RETURNING id,name,phone,created_at,verification_status`,
      [name.trim(), phone.trim(), hashedPassword],
    );
    return res.status(201).json({
      message: "Muvaffaqiyatli ro'yhatdan o'tdi",
      barber: result.rows[0],
    });
  } catch (error) {
    console.error(error.message);
    if (error.code === "23505") {
      return res.status(409).json({
        message: "Bu telefon raqami allaqachon ro'yxatdan o'tgan",
      });
    }

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}
// Login barbers
async function loginBarber(req, res) {
  try {
    const { phone, password } = req.body;
    if (typeof phone !== "string" || typeof password !== "string") {
      return res.status(400).json({
        message: "Telefon va parol kiritilishida xatolik ",
      });
    }
    if (!phone || !password) {
      return res.status(400).json({
        message: "Telefon va parol kiritilishi kerak",
      });
    }

    if (phone.trim() === "" || password.trim() === "") {
      return res.status(400).json({
        message: "Telefon va parol bo'sh bo'lmasligi kerak",
      });
    }
    //checking phone from psql
    const result = await pool.query("SELECT *FROM barbers WHERE phone=$1", [
      phone.trim(),
    ]);
    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Telefon raqami yoki parol noto'g'ri",
      });
    }
    const barber = result.rows[0];
    //checking password
    const isPasswordCorrect = await bcrypt.compare(password, barber.password);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Telefon raqami yoki parol noto'g'ri",
      });
    }
    const token = jwt.sign(
      { id: barber.id, role: "barber" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );
    return res.status(200).json({
      message: "Tizimga muvaffaqiyatli kirildi",
      verification_status: barber.verification_status,
      token,
      barber: {
        id: barber.id,
        name: barber.name,
        phone: barber.phone,
      },
    });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}
// Yangi sartarosh qo'shish
async function addBarber(req, res) {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Adminlar uchun " });
    }
    const { name, phone, password } = req.body;

    if (typeof name != "string" || name.trim() == "") {
      return res.status(400).json({
        message: "Name kiritishda xatolik",
      });
    }
    if (typeof phone != "string" || phone.trim() === "") {
      return res.status(400).json({
        message: "Phone number kiritishda xatolik",
      });
    }
    if (
      typeof password != "string" ||
      password.trim() === "" ||
      password.length < 8
    ) {
      return res.status(400).json({
        message: "Password kiritishda xatolik",
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO barbers(name,phone,password) VALUES($1,$2,$3) RETURNING id,name,phone,created_at`,
      [name.trim(), phone.trim(), hashedPassword],
    );
    return res.status(201).json({
      message: "Sartarosh muvaffaqiyatli yaratildi",
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error.message);

    if (error.code === "23505") {
      return res.status(409).json({
        message: "Bu telefon raqami allaqachon ro'yhatdan o'tgan",
      });
    }
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}
// Sartarosh ma'lumotlarini yangilash
async function refreshData(req, res) {
  try {
    const id = Number(req.params.id);
    const { name, phone } = req.body;

    if (req.user.role !== "barber") {
      return res.status(403).json({ message: "Barber emas" });
    }
    if (id !== req.user.id) {
      return res.status(403).json({ message: "Id mos emas" });
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
    if (typeof phone !== "string" || phone.trim() === "") {
      return res.status(400).json({
        message: "Phone number kiritishda xatolik",
      });
    }
    const result = await pool.query(
      `UPDATE barbers SET name=$1,phone=$2 WHERE id=$3 RETURNING id,name,phone,created_at`,
      [name.trim(), phone.trim(), id],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Sartarosh topilmadi",
      });
    }
    return res.json({
      message: "Sartarosh ma'lumotlari yangilandi",
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error.message);

    if (error.code === "23505") {
      return res.status(409).json({
        message: "Bu telefon raqami allaqchon band",
      });
    }
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}
// Sartaroshni o'chirish
async function deleteBarber(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "ID kiritishda xatolik",
      });
    }
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Faqat admin uchun" });
    }
    const result = await pool.query("DELETE FROM barbers WHERE id=$1", [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Sartarosh topilmadi",
      });
    }
    return res.json({
      message: "Sartarosh o'chirildi",
    });
  } catch (error) {
    console.error(error.message);

    if (error.code === "23503") {
      return res.status(409).json({
        message:
          "Sartaroshga bog'langan buyurtmalar mavjud, uni o'chirib bo'lmaydi",
      });
    }
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
      `UPDATE barbers
       SET verification_status=$1
       WHERE id=$2
       RETURNING id,name,phone,verification_status
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
async function setWorkingHours(req, res) {
  let client;
  let transactionStarted = false;

  try {
    // 1. Faqat barber ish jadvalini o'zgartirishi mumkin
    if (req.user.role !== "barber") {
      return res.status(403).json({
        message: "Faqat barber ish jadvalini o'zgartira oladi",
      });
    }
    const barberResult = await pool.query(
      "SELECT verification_status FROM barbers WHERE id=$1",
      [req.user.id],
    );
    if (barberResult.rowCount === 0) {
      return res.status(404).json({
        message: "Barber topilmadi",
      });
    }
    if (barberResult.rows[0].verification_status !== "approved") {
      return res.status(403).json({
        message: "Ish jadvalini o'zgartirish uchun admin tasdig'i kerak",
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
    client = await pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    // 7. Eski ish jadvalini o'chiramiz
    await client.query(
      "DELETE FROM barber_working_hours WHERE barber_id = $1",
      [req.user.id],
    );

    // 8. Yangi ish jadvalini saqlaymiz
    for (const day of working_hours) {
      await client.query(
        `INSERT INTO barber_working_hours
          (barber_id, day_of_week, start_time, end_time)
         VALUES ($1, $2, $3, $4)`,
        [req.user.id, day.day_of_week, day.start_time, day.end_time],
      );
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
async function getWorkingHours(req, res) {
  try {
    const barberId = req.user.id;

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
  setWorkingHours,
  getWorkingHours,
};
