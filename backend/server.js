const express = require("express");
const cors = require("cors");
require("dotenv").config();

if(!process.env.JWT_SECRET){
  console.error("JWT_SECRET .env faylida topilmadi");
  process.exit(1)
}

const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;
const customersRouter = require("./routes/customers");
const barbersRouter = require("./routes/barbers");
const servicesRouter = require("./routes/services");
const bookingsRouter = require("./routes/bookings");
const adminRouter=require("./routes/admin");
app.use(cors());
app.use(express.json());

// Server ishlayotganini tekshirish
app.get("/", (req, res) => {
  return res.json({
    message: "Ustara backend ishlayapti!",
  });
});

// Backend va PostgreSQL ulanishini tekshirish
app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS vaqt");

    return res.json({
      message: "Backend va PostgreSQL muvaffaqiyatli ulandi!",
      databaseTime: result.rows[0].vaqt,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "PostgreSQL bilan ulanishda xatolik yuz berdi",
    });
  }
});
app.use("/api/barbers", barbersRouter);
app.use("/api/customers", customersRouter);
app.use("/api/services", servicesRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/admin",adminRouter);
app.listen(PORT, () => {
  console.log(`Server http://localhost:${PORT} da ishlayapti`);
});
