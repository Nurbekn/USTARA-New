const { BookingStatusError } = require("../services/bookingStatusService");
function createBookingCallbackHandler({ bookings, api, botId, logger = console }) {
  const log = (text) => { try { logger.error(text); } catch { /* No credential-bearing error details. */ } };
  return async (query, signal) => {
    if (typeof query?.id !== "string" || !query.id || query.id.length > 256) return;
    const answer = (text, alert = true) => api("answerCallbackQuery", { callback_query_id: query.id, text, show_alert: alert }, signal);
    const message = query.message, chat = message?.chat;
    if (chat?.type !== "private" || !Number.isSafeInteger(chat.id) || chat.id <= 0
      || !Number.isSafeInteger(query.from?.id) || query.from.is_bot || query.from.id !== chat.id
      || !Number.isSafeInteger(botId) || message.from?.id !== botId || message.from?.is_bot !== true
      || !Number.isSafeInteger(message.message_id) || message.message_id <= 0) {
      await answer("Bu amal faqat botning o‘zingizga yuborilgan shaxsiy xabarida bajariladi."); return;
    }
    const parsed = typeof query.data === "string" && /^booking:(confirmed|rejected):([1-9]\d{0,9})$/.exec(query.data);
    if (!parsed || Number(parsed[2]) > 2147483647) { await answer("Booking buyrug‘i yaroqsiz."); return; }
    let text, clear = false, success = false;
    try {
      await bookings.reviewFromTelegram(Number(parsed[2]), parsed[1], chat.id);
      text = parsed[1] === "confirmed" ? "Booking tasdiqlandi." : "Booking rad etildi.";
      clear = true; success = true;
    } catch (error) {
      if (error instanceof BookingStatusError && error.status >= 400 && error.status < 500) {
        text = error.message;
        clear = error.code === "already_reviewed";
      } else {
        log("Telegram booking action failed");
        throw error; // Webhook must roll back and return 503 for technical failures.
      }
    }
    if (clear) {
      try {
        await api("editMessageReplyMarkup", { chat_id: chat.id, message_id: message.message_id,
          reply_markup: { inline_keyboard: [] } }, signal);
      } catch { log("Telegram booking button cleanup failed"); }
    }
    await answer(text, !success);
  };
}
module.exports = { createBookingCallbackHandler };
