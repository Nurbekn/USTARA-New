const express = require("express");
const registration = require("../controllers/registrationController");
const router = express.Router();
// Loginning account/source himoyasi OTP IP budjetidan mustaqil.
router.post('/login', require('../services/loginAuthentication').createRoleLogin(null, require('../db')));
router.use(require('../middleware/otpRateLimit').otpIpLimit);
router.post('/telegram/webhook', require('../telegram/webhook').webhook);
router.get('/telegram', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const { botUrl } = require('../services/telegramOtp').telegramOtpConfig();
    return res.json({ channel: 'telegram', botUrl });
  } catch {
    return res.status(503).json({ code: 'telegram_otp_unavailable', message: 'Telegram bot hali sozlanmagan.' });
  }
});
const reset = require("../controllers/passwordResetController");

const phoneChange = require('../controllers/phoneChangeController');
const auth = require('../middleware/authMiddleware');
router.post('/account/deactivate', auth, require('../controllers/accountPauseController').deactivate);
const sessions = require('../controllers/sessionsController');
router.get('/sessions/devices', auth, sessions.list);
router.post('/sessions/devices/:id/revoke', auth, sessions.revokeOne);
router.post('/sessions/revoke-all', auth, sessions.revokeAll);
// Public, rate-limited manual recovery is a support ticket, never a reset bypass.
const manualRecovery = require('../controllers/manualAccountRecoveryController');
router.post('/account-recovery/start', manualRecovery.start);
router.post('/account-recovery/status', manualRecovery.status);
for (const action of ['start', 'choose', 'status', 'resend', 'verify']) {
  router.post(`/phone-change/${action}`, auth, phoneChange[action]);
}

router.post("/registration/start", registration.start);
router.post("/registration/status", registration.status);
router.post("/registration/resend", registration.resend);
router.post("/registration/verify", registration.verify);
router.post("/registration/complete", registration.complete);

router.post("/password-reset/start", reset.start);
router.post("/password-reset/resend", reset.resend);
router.post("/password-reset/verify", reset.verify);
router.post("/password-reset/complete", reset.complete);

module.exports = router;
