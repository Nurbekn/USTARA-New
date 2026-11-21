class BookingStatusError extends Error {
  constructor(status, code, message, currentStatus) { super(message); Object.assign(this, { status, code, currentStatus }); }
}
const fail = (status, code, message, currentStatus) => new BookingStatusError(status, code, message, currentStatus);
const transitions = { pending: ["confirmed", "cancelled", "rejected"], confirmed: ["completed", "cancelled"], completed: [], cancelled: [], rejected: [] };
function createBookingStatusService({ pool }) {
  async function change({ id, status, actor, chatId }) {
    if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw fail(400, "invalid_id", "ID kiritishda xatolik");
    const telegram = chatId !== undefined;
    if (telegram) {
      if (!Number.isSafeInteger(chatId) || chatId <= 0 || !["confirmed", "rejected"].includes(status)) throw fail(403, "forbidden", "Bu amal uchun ruxsat yo'q");
    } else {
      if (!["customer", "barber"].includes(actor?.role) || !Number.isSafeInteger(actor.profileId) || actor.profileId <= 0 || actor.profileId > 2147483647) throw fail(403, "forbidden", "Bu amal uchun ruxsat yo'q");
      if (actor.role === "customer" && status !== "cancelled") throw fail(403, "forbidden", "Mijoz faqat bookingni bekor qilishi mumkin");
    }
    const client = await pool.connect(); let broken = false, commitStarted = false;
    // If COMMIT loses its reply, the outcome can be unknown. Never reuse
    // this connection: a retry must be reconciled against persisted status.
    const commit = async () => {
      commitStarted = true;
      await client.query('COMMIT');
      commitStarted = false;
    };
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='15s'");
      if (telegram) {
        const linked = await client.query(`SELECT t.barber_id FROM barber_telegram_links t
          JOIN barbers b ON b.id=t.barber_id JOIN users u ON u.id=b.user_id
          WHERE t.chat_id=$1 AND u.role='barber'`, [String(chatId)]);
        if (!linked.rowCount) throw fail(403, "forbidden", "Telegram hisobi barber profiliga bog‘lanmagan yoki ruxsat yo‘q.");
        actor = { role: "barber", profileId: linked.rows[0].barber_id };
      }
      const owner = actor.role === "customer" ? "customer_id" : "barber_id";
      const target = await client.query(`SELECT barber_id FROM bookings WHERE id=$1 AND ${owner}=$2`, [id, actor.profileId]);
      if (!target.rowCount) throw fail(404, "not_found", "Booking topilmadi yoki uni boshqarishga ruxsat yo‘q.");
      await client.query("SELECT pg_advisory_xact_lock($1)", [target.rows[0].barber_id]);
      if (telegram) {
        // Same barber-row lock used by linking/unlinking: authorization cannot
        // be transferred to a different chat between this check and COMMIT.
        const barber = await client.query(`SELECT b.id FROM barbers b JOIN users u ON u.id=b.user_id
          WHERE b.id=$1 AND u.role='barber' FOR SHARE OF b,u`, [actor.profileId]);
        if (!barber.rowCount) throw fail(403, "forbidden", "Barber hisobi topilmadi.");
        const linked = await client.query(`SELECT barber_id FROM barber_telegram_links
          WHERE barber_id=$1 AND chat_id=$2 FOR SHARE`, [actor.profileId, String(chatId)]);
        if (!linked.rowCount) throw fail(403, "forbidden", "Telegram bog‘lanishi o‘zgargan. Ruxsat yo‘q.");
      }
      const selected = await client.query(`SELECT bookings.id,bookings.status,bookings.booking_time,bookings.duration_minutes,
        bookings.customer_id,bookings.barber_id,bookings.service_id,
        (to_jsonb(bookings)->>'total_price')::numeric AS total_price,
        bookings.cancellation_cutoff_minutes,bookings.cancellation_policy_text
        FROM bookings WHERE bookings.id=$1 AND bookings.${owner}=$2 FOR UPDATE OF bookings`, [id, actor.profileId]);
      if (!selected.rowCount) throw fail(404, "not_found", "Booking topilmadi");
      const booking = selected.rows[0];
      if (telegram && booking.status !== "pending") throw fail(409, "already_reviewed", "Booking allaqachon ko‘rib chiqilgan yoki bekor qilingan.", booking.status);
      // Retried HTTP cancellation after an interrupted response is a safe no-op.
      // It must not change occupancy or produce a second Telegram notice.
      // Authorization and the booking row lock were checked above.
      if (!telegram && status === 'cancelled' && booking.status === 'cancelled') {
        await commit();
        return { ...booking, replayed: true };
      }
      const start = new Date(booking.booking_time).getTime(), duration = Number(booking.duration_minutes);
      if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) throw fail(500, "invalid_state", "Booking vaqti yoki xizmat davomiyligi bazada noto'g'ri");
      if (!transitions[booking.status]?.includes(status)) throw fail(400, "invalid_transition", "Bu statusga o'tish mumkin emas");
      // The deadline is snapshotted when the booking is created. Barber rule
      // changes cannot retroactively remove the customer's cancellation right.
      // Barber-side cancellation remains allowed for exceptional circumstances.
      if (!telegram && actor.role === 'customer' && status === 'cancelled'
          && booking.cancellation_cutoff_minutes != null) {
        const cutoff = Number(booking.cancellation_cutoff_minutes);
        if (!Number.isInteger(cutoff) || cutoff < 0 || cutoff > 10080) throw fail(500, 'invalid_state', 'Bron qoidalari noto‘g‘ri');
        const clock = await client.query('SELECT clock_timestamp() AS now');
        if (new Date(clock.rows[0].now).getTime() >= start - cutoff * 60000)
          throw fail(409, 'cancellation_deadline_passed', 'Bu bronni onlayn bekor qilish muddati tugagan. Sartaroshga murojaat qiling.');
      }
      if (status === "completed") {
        const clock = await client.query("SELECT clock_timestamp() AS now");
        if (start + duration * 60000 > new Date(clock.rows[0].now).getTime()) throw fail(400, "too_early", "Xizmat tugash vaqti hali kelmagan");
      }
      const updated = await client.query(`UPDATE bookings SET status = $1
        WHERE id = $2 AND ${owner} = $3 AND status = $4 RETURNING *`, [status, id, actor.profileId, booking.status]);
      if (!updated.rowCount) throw fail(409, "changed", "Booking holati o'zgargan. Qayta urinib ko'ring");
      await commit(); return updated.rows[0];
    } catch (error) {
      if (commitStarted) broken = true;
      try { await client.query("ROLLBACK"); } catch { broken = true; }
      throw error;
    } finally { client.release(broken); }
  }
  return { update: (id, status, actor) => change({ id, status, actor }),
    reviewFromTelegram: (id, status, chatId) => change({ id, status, chatId }) };
}
module.exports = { createBookingStatusService, BookingStatusError };
