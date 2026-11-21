const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const reviews = require("../controllers/reviewsController");
const pool = require("../db");
const lateNotice = require("../controllers/bookingLateNoticeV169");
const checkIn = require("../controllers/bookingCheckInV170");
const privateNotes = require("../controllers/bookingPrivateNotesV182");
const phoneInvites = require("../controllers/phoneBookingInvitesV185");
const {
  getBookingRecovery,
  getModifySlots,
  modifyBooking,
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
router.get("/available-slots",getAvailableSlots)
router.post("/:id/review", authMiddleware, reviews.create);
// Recovery endpoint must precede the /:id route.
router.get("/recovery/:requestId", authMiddleware, getBookingRecovery);
// v185: separate signed-in barber management and public read-only token lookup.
router.post("/phone-invites", authMiddleware, phoneInvites.createHandler({ connect: () => pool.connect() }));
router.get("/phone-invites/mine", authMiddleware, phoneInvites.listHandler({ query: (...args) => pool.query(...args) }));
router.delete("/phone-invites/:id", authMiddleware, phoneInvites.revokeHandler({ query: (...args) => pool.query(...args) }));
router.get("/phone-invites/:token", phoneInvites.readHandler({ query: (...args) => pool.query(...args) }));
// Bitta bookingni ID orqali olish
router.get("/:id", authMiddleware, getBookingById);
// Yangi booking yaratish
router.post("/", authMiddleware, createBooking);
// #101: authorized late-arrival notice (never reschedules a booking).
router.post("/:id/late-notice", authMiddleware, lateNotice.createHandler({ connect: () => pool.connect() }));
// #102: customer reports arrival; booking barber explicitly confirms.
router.post("/:id/check-in", authMiddleware, checkIn.requestHandler({ connect: () => pool.connect() }));
router.post("/:id/check-in/confirm", authMiddleware, checkIn.confirmHandler({ connect: () => pool.connect() }));
// #179: never merge private note into general booking API responses.
router.get("/:id/private-note", authMiddleware, privateNotes.readHandler({ query: (...args) => pool.query(...args) }));
router.put("/:id/private-note", authMiddleware, privateNotes.saveHandler({ connect: () => pool.connect() }));
router.delete("/:id/private-note", authMiddleware, privateNotes.deleteHandler({ connect: () => pool.connect() }));
// Booking statusini yangilash
router.put("/:id", authMiddleware, refreshStatus);
router.patch("/:id/modify", authMiddleware, modifyBooking);
router.get("/:id/modify-slots", authMiddleware, getModifySlots);
// Bookingni o'chirish
router.delete("/:id", authMiddleware, deleteBooking);
module.exports = router;
