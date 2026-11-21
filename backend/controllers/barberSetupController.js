const { createBarberSetupService } = require('../services/barberSetup');
const { BarberProfileError } = require('../services/barberProfile');
function createBarberSetupController(pool) {
  const save = createBarberSetupService(pool);
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { return res.json({ message: 'Profil va ish jadvali saqlandi.', ...await save(req.body, req.user) }); }
    catch (error) {
      if (error instanceof BarberProfileError) return res.status(error.status).json({ message: error.message, code: error.code });
      return res.status(503).json({ message: 'Profil va jadval saqlanmadi. Qayta urinib ko‘ring.', code: 'setup_unavailable' });
    }
  };
}
let controller;
module.exports = { createBarberSetupController, save(req, res) {
  controller ||= createBarberSetupController(require('../db'));
  return controller(req, res);
} };
