const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  deleteBooking,
  refreshStatus,
  createBooking,
  getBookingById,
  getBooking,
  getAvailableSlots
} = require("../controllers/bookingsController");

//Barcha bookinglarni olish
router.get("/", authMiddleware, getBooking);
//Bo'sh slotlarni topish
router.get("/available-slots",authMiddleware,getAvailableSlots)
// Bitta bookingni ID orqali olish
router.get("/:id", authMiddleware, getBookingById);
// Yangi booking yaratish
router.post("/", authMiddleware, createBooking);
// Booking statusini yangilash
router.put("/:id", authMiddleware, refreshStatus);
// Bookingni o'chirish
router.delete("/:id", authMiddleware, deleteBooking);
module.exports = router;
