const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Barcha mijozlarni olish
async function getCustomers(req, res) {
  try {
    if (req.user.role !== "admin" && req.user.role !== "barber") {
      return res.status(403).json({ message: "Bu amal uchun ruxsat yo'q" });
    }
    if (req.user.role === "admin") {
      const result = await pool.query(
        "SELECT id, name, phone, created_at FROM customers",
      );

      return res.json(result.rows);
    }
    const result = await pool.query(
      `SELECT DISTINCT c.id,c.name,c.phone,c.created_at
       FROM customers c
       JOIN bookings b ON b.customer_id=c.id
       WHERE b.barber_id=$1
      `,
      [req.user.id],
    );
    return res.json(result.rows);
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}
// Yangi mijozni ro'yhatdan utqazish
async function registerCustomer(req, res) {
  try {
    const { name, phone, password } = req.body;
    if (typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({
        message: "Ism bo'sh bulmasligi kerak",
      });
    }
    if (typeof phone !== "string" || phone.trim() === "") {
      return res.status(400).json({
        message: "Phone bo'sh bulmasligi kerak",
      });
    }
    if (typeof password !== "string" || password.trim() === "") {
      return res.status(400).json({
        message: "Password bo'sh bulmasligi kerak",
      });
    }
    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Parol kamida 8 ta belgidan iborat bo'lishi kerak" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO customers (name,phone,password) VALUES ($1,$2,$3) RETURNING id,name,phone,created_at`,
      [name.trim(), phone.trim(), hashedPassword],
    );
    return res.status(201).json({
      message: "Muvaffaqiyatli ro'yhatdan o'tdi",
      customer: result.rows[0],
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
// Login
async function loginCustomer(req, res) {
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
    const result = await pool.query("SELECT *FROM customers WHERE phone=$1", [
      phone.trim(),
    ]);
    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Telefon raqami yoki parol noto'g'ri",
      });
    }
    const customer = result.rows[0];
    //checking password
    const isPasswordCorrect = await bcrypt.compare(password, customer.password);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Telefon raqami yoki parol noto'g'ri",
      });
    }
    const token = jwt.sign(
      { id: customer.id, role: "customer" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );
    return res.status(200).json({
      message: "Tizimga muvaffaqiyatli kirildi",
      token,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
      },
    });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}
// Tizimga kirgan mijoz ma'lumotlarini olish
async function getMyProfile(req, res) {
  try {
    if(req.user.role!=="customer"){
      return res.status(403).json({
        message:"Faqat mijoz o'z profilini ko'ra oladi"
      })
    }
    const result = await pool.query(
      "SELECT id,name,phone,created_at FROM customers WHERE id=$1",
      [req.user.id],
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
async function takeCustomerById(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
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
      const booking = await pool.query(
        `SELECT 1
         FROM bookings
         WHERE customer_id = $1
           AND barber_id = $2
         LIMIT 1`,
        [id, req.user.id],
      );

      if (booking.rowCount === 0) {
        return res.status(403).json({
          message: "Bu mijozni ko'rishga ruxsatingiz yo'q",
        });
      }
    }

    // Admin uchun bron tekshiruvi talab qilinmaydi
    const result = await pool.query(
      `SELECT id, name, phone, created_at
       FROM customers
       WHERE id = $1`,
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Mijoz topilmadi",
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
// Yangi mijoz qo'shish
async function addCustomer(req, res) {
  try {
    const { name, phone, password } = req.body;
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Adminlar uchun " });
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

    if (
      typeof password !== "string" ||
      password.trim() === "" ||
      password.length < 8
    ) {
      return res.status(400).json({
        message: "Password kiritishda xatolik",
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO customers (name, phone, password)
       VALUES ($1, $2, $3)

       RETURNING id, name, phone, created_at`,
      [name.trim(), phone.trim(), hashedPassword],
    );

    return res.status(201).json({
      message: "Mijoz muvaffaqiyatli yaratildi",
      data: result.rows[0],
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

// Mijoz ma'lumotlarini yangilash
async function refreshData(req, res) {
  try {
    const id = Number(req.params.id);
    const { name, phone } = req.body;

    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Customer emas" });
    }
    if (id !== req.user.id) {
      return res.status(403).json({ message: "Id mos emas" });
    }

    const customer_id = req.user.id;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "ID noto'g'ri",
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
      `UPDATE customers
       SET name = $1, phone = $2
       WHERE id = $3
       RETURNING id, name, phone, created_at`,
      [name.trim(), phone.trim(), id],
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
    console.error(error.message);

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
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Faqat admin uchun" });
    }
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "ID noto'g'ri",
      });
    }

    const result = await pool.query("DELETE FROM customers WHERE id = $1", [
      id,
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Mijoz topilmadi",
      });
    }

    return res.json({
      message: "Mijoz o'chirildi",
    });
  } catch (error) {
    console.error(error.message);

    if (error.code === "23503") {
      return res.status(409).json({
        message: "Mijozga bog'langan ma'lumotlar mavjud",
      });
    }

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
