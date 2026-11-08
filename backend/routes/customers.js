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
