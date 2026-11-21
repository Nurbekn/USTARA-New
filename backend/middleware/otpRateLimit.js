const { createOtpRateLimit } = require('../services/otpRateLimit');
function createOtpIpLimit({ pool, env = process.env, logger = console }) {
  const consume = createOtpRateLimit({ pool, env });
  return async (req, res, next) => {
    if (req.method !== 'POST' || !/^\/(registration|password-reset)\//.test(req.path)) return next();
    res.set('Cache-Control', 'no-store');
    const action = req.path.split('/').at(-1);
    const maximum = action === 'status' ? 240 : ['start', 'resend'].includes(action) ? 20 : 120;
    try {
      if (await consume('ip:' + action, req.ip || req.socket?.remoteAddress || 'unknown', maximum, 600)) return next();
      res.set('Retry-After', '600');
      return res.status(429).json({ code: 'otp_rate_limited', retryAfter: 600, message: 'So‘rovlar ko‘paydi. Keyinroq qayta urinib ko‘ring.' });
    } catch (error) {
      const reasons = { otp_unavailable: 'otp_configuration', '42P01': 'schema_missing',
        '42703': 'schema_mismatch', '42501': 'storage_permission', 'ECONNREFUSED': 'storage_connection',
        'ETIMEDOUT': 'storage_timeout' };
      // Only fixed categories: pg details and request fields can contain secrets.
      const reason = Object.hasOwn(reasons, error?.code) ? reasons[error.code] : 'storage_unavailable';
      try { logger.error('otp_rate_limit_unavailable', { stage: 'otp_ip_limit', reason }); } catch { /* Remain fail-closed. */ }
      return res.status(503).json({ code: 'otp_unavailable', message: 'Tasdiqlash xizmati vaqtincha ishlamayapti.' });
    }
  };
}
let middleware;
module.exports = { createOtpIpLimit, otpIpLimit(req, res, next) {
  middleware ||= createOtpIpLimit({ pool: require('../db') });
  return middleware(req, res, next);
} };
