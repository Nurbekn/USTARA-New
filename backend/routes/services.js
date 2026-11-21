const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const {
  deleteService,
  setServiceStatus,
  refreshServiceData,
  getServiceById,
  getSevices,
  addService,
} = require("../controllers/servicesController");

// Guest-safe read-only catalog; mutation and private service endpoints remain protected.
router.get('/public', require('../controllers/servicesController').getPublicServices);

// Yangi xizmat qo'shish
router.post("/", authMiddleware, addService);

// Sartarosh xizmatlarini olish
router.get("/", authMiddleware, getSevices);

// Bitta xizmatni id orqali olish
router.get("/:id", authMiddleware, getServiceById);

// Xizmat ma'lumotlarini yangilash
router.put("/:id", authMiddleware, refreshServiceData);

// Xizmatni mavjud bronlarni saqlagan holda yashirish/qayta faollashtirish
router.patch('/:id/status', authMiddleware, setServiceStatus);

// Xizmatni o'chirish
router.delete("/:id", authMiddleware, deleteService);
module.exports = router;
