const { createPasswordResetService } = require("../services/passwordResetService");
const { RegistrationError } = require("../utils/registration");
const { setTimeout: delay } = require('node:timers/promises');
function createPasswordResetController(service, { env = process.env, now = () => performance.now(), sleep = delay } = {}) {
  return Object.fromEntries(["start", "resend", "verify", "complete", "unblock"].map((action) => [action, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const startedAt = now();
    const reply = async (status, body) => {
      // Mask the normal known-account-only Telegram call (8-second deadline).
      if (env.NODE_ENV === 'production' && ['start', 'resend'].includes(action)) {
        await sleep(Math.max(0, 9000 - (now() - startedAt)));
      }
      return res.status(status).json(body);
    };
    try {
      const result = await service[action](req.body, req.user);
      if (result.body.retryAfter) res.set("Retry-After", String(result.body.retryAfter));
      return reply(result.status, result.body);
    } catch (error) {
      if (error instanceof RegistrationError) return reply(error.status, { message: error.message, code: error.code });
      return reply(503, { message: "Parolni tiklash xizmati vaqtincha ishlamayapti.", code: "reset_unavailable" });
    }
  }]));
}
let controller;
const actions = Object.fromEntries(["start", "resend", "verify", "complete", "unblock"].map((action) => [action, (req, res) => {
  controller ||= createPasswordResetController(createPasswordResetService({ pool: require("../db") }));
  return controller[action](req, res);
}]));
module.exports = { ...actions, createPasswordResetController };
