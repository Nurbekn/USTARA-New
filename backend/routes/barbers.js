const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  deleteBarber,
  refreshData,
  addBarber,
  takeBarberById,
  getBarbers,
  registerBarber,
  loginBarber,
  verifyBarber,
  getPendingBarbers,
  setWorkingHours,
  getWorkingHours,
} = require("../controllers/barbersController");

// Barcha sartaroshlarni olish
router.get("/", getBarbers);
// Pending barbers
router.get("/pending", authMiddleware, getPendingBarbers);
// bitta sartaroshni ID orqali olish.
router.get("/:id", takeBarberById);
// register barber
router.post("/register", registerBarber);
// login barbers
router.post("/login", loginBarber);
// Yangi sartarosh qo'shish
router.post("/", authMiddleware, addBarber);
// Working hours
router.put("/working-hours", authMiddleware, setWorkingHours);
//Sartaroshni haftalik ish vaqtini olish
router.get("/working-hours",authMiddleware,getWorkingHours)
// Sartarosh ma'lumotlarini yangilash
router.put("/:id", authMiddleware, refreshData);
// Sartaroshni o'chirish
router.delete("/:id", authMiddleware, deleteBarber);
// Verify barbers
router.patch("/:id/verify", authMiddleware, verifyBarber);
module.exports = router;
