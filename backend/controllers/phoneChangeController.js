const { RegistrationError } = require('../utils/registration');
const { createOtpRateLimit } = require('../services/otpRateLimit');
const { createPhoneChangeService } = require('../services/phoneChangeService');
function createPhoneChangeController({ pool, env = process.env, service = createPhoneChangeService({ pool, env }) }) {
  const consume = createOtpRateLimit({ pool, env });
  return Object.fromEntries(['start', 'choose', 'status', 'resend', 'verify'].map(action => [action, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      if (!['customer', 'barber'].includes(req.user?.role)) return res.status(403).json({ code: 'forbidden', message: 'Bu amal uchun ruxsat yo‘q.' });
      const scope = action === 'choose' ? 'complete' : action;
      const ip = req.socket?.remoteAddress || 'unknown';
      if (!await consume(`ip:${scope}`, `phone-change:${action}:${ip}`, action === 'status' ? 240 : 30, 600)) {
        res.set('Retry-After', '600');
        return res.status(429).json({ code: 'phone_change_limited', message: 'So‘rovlar ko‘paydi. Biroz kuting.', retryAfter: 600 });
      }
      const answer = await service[action](req.body, req.user, ip);
      if (answer.body.retryAfter) res.set('Retry-After', String(answer.body.retryAfter));
      return res.status(answer.status).json(answer.body);
    } catch (error) {
      if (error instanceof RegistrationError) return res.status(error.status).json({ code: error.code, message: error.message });
      if (error?.code === '23505') return res.status(409).json({ code: 'phone_change_conflict', message: 'Raqam yoki Telegram hisobi band. Qayta boshlang.' });
      return res.status(503).json({ code: 'phone_change_unavailable', message: 'Raqamni almashtirish vaqtincha ishlamayapti.' });
    }
  }]));
}
let controller;
module.exports = { createPhoneChangeController, ...Object.fromEntries(['start', 'choose', 'status', 'resend', 'verify'].map(action => [action, (req, res) => {
  controller ||= createPhoneChangeController({ pool: require('../db') });
  return controller[action](req, res);
}])) };
