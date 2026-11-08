const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const {
  deleteService,
  refreshServiceData,
  getServiceById,
  getSevices,
  addService,
} = require("../controllers/servicesController");

// Yangi xizmat qo'shish
router.post("/", authMiddleware, addService);

// Sartarosh xizmatlarini olish
router.get("/", authMiddleware, getSevices);

// Bitta xizmatni id orqali olish
router.get("/:id", authMiddleware, getServiceById);

// Xizmat ma'lumotlarini yangilash
router.put("/:id", authMiddleware, refreshServiceData);

// Xizmatni o'chirish
router.delete("/:id", authMiddleware, deleteService);
module.exports = router;
