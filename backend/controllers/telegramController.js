const { createTelegramLinkService, TelegramLinkError } = require("../services/telegramLinkService");
function createTelegramController(service) {
  return Object.fromEntries(["start", "status", "unlink"].map((action) => [action, async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (req.user?.role !== "barber") return res.status(403).json({ message: "Faqat barber uchun." });
    try { return res.status(200).json(await service[action](req.user)); }
    catch (error) {
      if (error instanceof TelegramLinkError) return res.status(error.status).json({ code: error.code, message: error.message });
      return res.status(503).json({ message: "Telegram bog‘lash xizmati vaqtincha ishlamayapti." });
    }
  }]));
}
let controller;
module.exports = { createTelegramController, ...Object.fromEntries(["start", "status", "unlink"].map((action) => [action, (req, res) => {
  controller ||= createTelegramController(createTelegramLinkService({ pool: require("../db") }));
  return controller[action](req, res);
}])) };
