"use strict";
const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { createGeminiCaption, CaptionError } = require("./geminiCaption");

// This small limiter is extra protection against repeated paid calls. It is
// process-local; production reverse proxies should also enforce distributed
// rate limits on /api/ai.
function createCaptionHandler({ generate = createGeminiCaption(), clock = Date.now } = {}) {
  const windowMs = 15 * 60 * 1000;
  const uses = new Map();
  return async function postCaption(req, res) {
    if (req.user?.role !== "barber") return res.status(403).json({ message: "Faqat sartaroshlar foydalanishi mumkin." });
    const id = req.user.accountId ?? req.user.id;
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(401).json({ message: "Akkaunt aniqlanmadi." });
    const now = clock();
    if (uses.size > 3000) for (const [key, entry] of uses) if (now - entry.start >= windowMs) uses.delete(key);
    const entry = uses.get(id);
    const state = entry && now - entry.start < windowMs ? entry : { start: now, count: 0 };
    if (state.count >= 6) return res.status(429).json({ code: "ai_limit", message: "15 daqiqada 6 ta tavsif yaratish mumkin." });
    // Charge attempts as well as successes, to avoid provider-cost bursts.
    state.count += 1; uses.set(id, state);
    try {
      const caption = await generate(req.body);
      return res.json({ caption });
    } catch (err) {
      if (err instanceof CaptionError) return res.status(err.status).json({ code: err.code, message: err.message });
      return res.status(503).json({ code: "ai_unavailable", message: "AI yordamchisi vaqtincha ishlamayapti." });
    }
  };
}
const router = express.Router();
router.post("/post-caption", authMiddleware, createCaptionHandler());
module.exports = { router, createCaptionHandler };
