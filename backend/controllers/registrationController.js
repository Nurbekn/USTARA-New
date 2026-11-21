const { createRegistrationService } = require("../services/registrationService");
const { RegistrationError } = require("../utils/registration");

function createRegistrationController(service) {
  const handle = (action) => async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const result = await service[action](req.body, req.user, req.headers || {});
      if (result.body.retryAfter) res.set("Retry-After", String(result.body.retryAfter));
      return res.status(result.status).json(result.body);
    } catch (error) {
      if (error instanceof RegistrationError) {
        return res.status(error.status).json({ message: error.message, code: error.code });
      }
      if (error?.code === "23505") {
        return res.status(409).json({ message: "Account yoki registration allaqachon mavjud", code: "registration_conflict" });
      }
      // Never log a pg error/detail, request body, OTP, hash or session token.
      return res.status(500).json({ message: "Serverda xatolik yuz berdi", code: "registration_error" });
    }
  };
  return Object.fromEntries(["start", "resend", "verify", "complete", "unblock", "status"].map((action) => [action, handle(action)]));
}

let controller;
const actions = {};
for (const action of ["start", "resend", "verify", "complete", "unblock", "status"]) {
  actions[action] = (req, res) => {
    controller ||= createRegistrationController(createRegistrationService({ pool: require("../db") }));
    return controller[action](req, res);
  };
}

function registrationRequired(req, res) {
  return res.status(410).json({
    message: "OTP orqali ro'yxatdan o'ting: /api/auth/registration/start",
    code: "otp_registration_required",
  });
}

module.exports = { ...actions, createRegistrationController, registrationRequired };
