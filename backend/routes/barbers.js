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
  getMyBarberProfile,
  setWorkingHours,
  getWorkingHours,
  setBookingAcceptance,
} = require("../controllers/barbersController");

// Barcha sartaroshlarni olish
router.get("/", getBarbers);
// Pending barbers
router.get("/pending", authMiddleware, getPendingBarbers);
router.get("/me", authMiddleware, getMyBarberProfile);
router.get("/earnings", authMiddleware, require("../controllers/barberEarningsController").get);
router.put("/setup", authMiddleware, require("../controllers/barberSetupController").save);
const social = require("../controllers/socialController");
const reviews = require("../controllers/reviewsController");
const cancellationPolicy = require('../controllers/cancellationPolicyController').createCancellationPolicyHandlers();
router.get("/reviews/me", authMiddleware, reviews.getMyReviews);
router.put("/reviews/:id/reply", authMiddleware, reviews.reply);
router.get('/cancellation-policy', authMiddleware, cancellationPolicy.mine);
router.put('/cancellation-policy', authMiddleware, cancellationPolicy.update);
router.get('/:id/cancellation-policy', cancellationPolicy.publicRead);
router.get("/:id/working-hours", require("../controllers/barbersController").getPublicWorkingHours);
// Publicly published posts/reviews belong to approved profiles and are guest-readable.
// If a Bearer header is supplied, validate it normally; invalid/revoked sessions
// must never silently turn into a guest session. "me" still requires an account.
function optionalPublicAuth(req, res, next) {
  return req.headers.authorization === undefined ? next() : authMiddleware(req, res, next);
}
router.get("/:id/portfolio", optionalPublicAuth, social.getPortfolio);
router.get("/:id/reviews", optionalPublicAuth, reviews.getPublicReviews);
// Working-hours routes must precede /:id to avoid treating their name as an ID.
router.put("/working-hours", authMiddleware, setWorkingHours);
router.get("/working-hours", authMiddleware, getWorkingHours);
const calendar = require('../controllers/calendarExceptionsController').createHandlers();
router.get('/calendar-exceptions', authMiddleware, calendar.list);
router.put('/calendar-exceptions', authMiddleware, calendar.save);
router.delete('/calendar-exceptions/:date', authMiddleware, calendar.remove);
const breaks = require('../controllers/breakRulesController').createHandlers();
router.get('/break-rules', authMiddleware, breaks.list);
router.put('/break-rules/weekly', authMiddleware, breaks.weekly);
router.put('/break-rules/dated', authMiddleware, breaks.dated);
router.put("/booking-acceptance", authMiddleware, setBookingAcceptance);
const telegram = require("../controllers/telegramController");
router.post("/telegram/start", authMiddleware, telegram.start);
router.get("/telegram/status", authMiddleware, telegram.status);
router.delete("/telegram", authMiddleware, telegram.unlink);
// bitta sartaroshni ID orqali olish.
// v128 profile issue feedback; authentication happens before this controller.
const profileIssues = require('../controllers/profileIssueReports').createProfileIssueHandlers(require('../db'));
router.post('/:id/profile-report', authMiddleware, profileIssues.submit);
router.get('/:id/profile-report/status', authMiddleware, profileIssues.ownPending);
router.get('/:id/badges',require('../controllers/barberEvidenceBadgesV162').createHandlers().publicList);
router.get("/:id", takeBarberById);
// register barber
router.post("/register", registerBarber);
// login barbers
router.post("/login", loginBarber);
// Yangi sartarosh qo'shish
router.post("/", authMiddleware, addBarber);
// Sartarosh ma'lumotlarini yangilash
router.put("/:id", authMiddleware, refreshData);
// Sartaroshni o'chirish
router.delete("/:id", authMiddleware, deleteBarber);
// Verify barbers
router.patch("/:id/verify", authMiddleware, verifyBarber);
module.exports = router;
