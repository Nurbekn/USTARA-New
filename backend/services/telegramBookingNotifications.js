const { multiSchemaReady } = require('./bookingSelection');
const { createTelegramApi } = require("../telegram/api");
const local = new Intl.DateTimeFormat("uz-UZ", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const label = (value) => String(value || "").replace(/[\r\n\t]/g, " ").slice(0, 180);
function createBookingNotifier({ pool, api, env = process.env, logger = console }) {
  return async (bookingId, status = 'pending') => {
    if (!['pending', 'confirmed', 'cancelled', 'rescheduled'].includes(status)) return { sent: false, reason: 'invalid_status' };
    try {
      const result = await pool.query(`SELECT b.id,b.booking_time,b.duration_minutes,t.chat_id,
        c.first_name,c.last_name,s.name AS service_name,(to_jsonb(b)->>'total_price')::numeric AS total_price
        FROM bookings b JOIN barber_telegram_links t ON t.barber_id=b.barber_id
        JOIN barbers p ON p.id=b.barber_id JOIN users u ON u.id=p.user_id AND u.role='barber'
        JOIN customers c ON c.id=b.customer_id JOIN services s ON s.id=b.service_id
        WHERE b.id=$1 AND (($2::text='rescheduled' AND b.status IN ('pending','confirmed')) OR b.status=$2)`, [bookingId, status]);
      if (!result.rowCount) return { sent: false, reason: "not_linked_or_pending" };
      const booking = result.rows[0];
      let names = [booking.service_name];
      if (booking.total_price != null && await multiSchemaReady(pool)) {
        const items = await pool.query('SELECT service_name FROM booking_services WHERE booking_id=$1 ORDER BY position', [bookingId]);
        if (items.rowCount) names = items.rows.map(item => item.service_name);
      }
      const start = new Date(booking.booking_time), end = new Date(+start + booking.duration_minutes * 60000);
      const text = [status === 'cancelled' ? `Bron bekor qilindi #${booking.id}` : status === 'rescheduled' ? `Bron vaqti yoki xizmatlari o‘zgardi #${booking.id}` : status === 'confirmed' ? `Yangi bron tasdiqlandi #${booking.id}` : `Bron tekshiruvda #${booking.id}`, `Mijoz: ${label(booking.first_name)} ${label(booking.last_name)}`,
        `Xizmatlar: ${names.map(label).join(" + ")}`, `Boshlanish: ${local.format(start)}`,
        `Tugash: ${local.format(end)}`, `Davomiylik: ${booking.duration_minutes} daqiqa`, ...(booking.total_price == null ? [] : [`Jami narx: ${Number(booking.total_price).toLocaleString('uz-UZ')} so‘m`]), "Vaqt zonasi: Asia/Tashkent"].join("\n");
      const send = api || createTelegramApi(env.TELEGRAM_BOT_TOKEN);
      await send("sendMessage", { chat_id: String(booking.chat_id), text, protect_content: true,
        ...(status === 'pending' ? { reply_markup: { inline_keyboard: [[
          { text: "Tasdiqlash", callback_data: `booking:confirmed:${booking.id}` },
          { text: "Rad etish", callback_data: `booking:rejected:${booking.id}` },
        ]] } } : {}) }, AbortSignal.timeout(8000));
      return { sent: true };
    } catch {
      // No raw errors, request payloads, bot URLs, chat IDs or customer names.
      try { logger.error("Telegram booking notification failed", { bookingId }); } catch { /* Booking is already committed. */ }
      return { sent: false, reason: "delivery_failed" };
    }
  };
}
module.exports = { createBookingNotifier };
