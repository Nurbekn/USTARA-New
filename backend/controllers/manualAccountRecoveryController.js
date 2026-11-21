'use strict';
const { createManualAccountRecovery } = require('../services/manualAccountRecovery');
const { RegistrationError } = require('../utils/registration');
const { clientIp } = require('../services/loginProtection');

function createManualRecoveryController(service) {
  async function handle(action, req, res) {
    res.set('Cache-Control', 'no-store');
    try {
      // Do not trust X-Forwarded-For/req.ip for public rate-limit identity.
      // Only the direct network peer is trusted, as in the login limiter.
      const ip = action === 'start' || action === 'status' ? clientIp(req) : null;
      const result = action === 'start' ? await service.start(req.body, ip)
        : action === 'status' ? await service.status(req.body, ip)
          : action === 'cases' ? await service.cases(req.user)
            : await service.review(req.body, req.params.id, req.user);
      if (result.body.retryAfter) res.set('Retry-After', String(result.body.retryAfter));
      return res.status(result.status).json(result.body);
    } catch (error) {
      if (error instanceof RegistrationError) {
        return res.status(error.status).json({ code: error.code, message: error.message });
      }
      // Never return PostgreSQL errors, entered phone numbers, or access tokens.
      return res.status(503).json({ code: 'recovery_unavailable', message: 'Yordam xizmati vaqtincha ishlamayapti.' });
    }
  }
  return Object.fromEntries(['start','status','cases','review'].map(action =>
    [action, (req, res) => handle(action, req, res)]));
}
let singleton;
const controller = () => (singleton ||= createManualRecoveryController(createManualAccountRecovery({ pool: require('../db') })));
module.exports = { createManualRecoveryController,
  ...Object.fromEntries(['start','status','cases','review'].map(action =>
    [action, (req,res) => controller()[action](req,res)])),
};
