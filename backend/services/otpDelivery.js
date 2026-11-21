const { fail } = require('../utils/registration');
const { createTelegramOtpAdapter } = require('./telegramOtp');
const testDelivery = require('./registrationSms');

function createOtpDelivery({ pool, env = process.env }) {
  // Legacy test harnesses remain usable. Eskiz is never selected by this factory.
  const adapter = env.OTP_DELIVERY_ADAPTER || (env.OTP_SMS_ADAPTER === 'test' ? 'test' : 'telegram');
  if (adapter === 'telegram') return createTelegramOtpAdapter({ pool, env });
  if (adapter === 'test' && ['test', 'development'].includes(env.NODE_ENV)) {
    return testDelivery.createTestSmsAdapter({ ...env, OTP_SMS_ADAPTER: 'test' });
  }
  return { ready() { throw fail(503, 'Kod yetkazish xizmati sozlanmagan.', 'telegram_otp_unavailable'); },
    async send() { this.ready(); }, exposeCode() { return false; } };
}
module.exports = { createOtpDelivery };
