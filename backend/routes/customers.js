const express = require("express");
const router = express.Router();
const {
  getCustomers,
  deleteCustomer,
  refreshData,
  addCustomer,
  takeCustomerById,
  registerCustomer,
  loginCustomer,
  getMyProfile,
} = require("../controllers/customersController");
const authMiddleware = require("../middleware/authMiddleware");
// Barcha mijozlarni olish
router.get("/", authMiddleware,getCustomers);
// Ma'lumotlarini kura olish
router.get("/me", authMiddleware, getMyProfile);

// Explicit notification contact consent is separate from Telegram registration OTP.
const telegramV190 = require("../controllers/customerTelegramV190");
router.post("/telegram/start", authMiddleware, telegramV190.start);
router.get("/telegram/status", authMiddleware, telegramV190.status);
router.delete("/telegram", authMiddleware, telegramV190.unlink);
router.patch("/telegram/preferences", authMiddleware, telegramV190.preferences);

// v191: read-only opt-in booking notification status, never recipient chat IDs.
router.get('/telegram/notifications', authMiddleware, require('../controllers/customerBookingNotificationHistoryV191').history);

// Bitta mijozni id orqali olish
router.get("/:id",authMiddleware, takeCustomerById);

// ruyhatdan utqazish
router.post("/register", registerCustomer);

// login
router.post("/login", loginCustomer);

// Yangi mijoz qo'shish
router.post("/", authMiddleware, addCustomer);

// Mijoz ma'lumotlarini yangilash
router.put("/:id",  authMiddleware,refreshData);

// Mijozni o'chirish
router.delete("/:id",  authMiddleware,deleteCustomer);
module.exports = router;
