'use strict';
// Decision #144: an uncertain network response must never create a second booking.
// Called inside the same transaction that holds the customer's FOR UPDATE lock.
const { createHash } = require('node:crypto');
const { BookingSelectionError } = require('./bookingSelection');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function bookingRequest(body) {
  const requestId = body?.request_id;
  if (requestId === undefined) return null; // legacy clients
  if (typeof requestId !== 'string' || !UUID_RE.test(requestId)) {
    throw new BookingSelectionError(400, 'Bron so‘rovi identifikatori noto‘g‘ri.', 'invalid_request_id');
  }
  return requestId.toLowerCase();
}
function fingerprint(barberId, ids, bookingTime) {
  const stamp = Date.parse(bookingTime);
  if (!Number.isFinite(stamp)) throw new BookingSelectionError(400, 'Bron vaqti noto‘g‘ri.');
  return createHash('sha256').update(JSON.stringify({ barberId, serviceIds: ids, time: new Date(stamp).toISOString() })).digest('hex');
}
async function replayBooking(client, customerId, requestId, signature) {
  if (!requestId) return null;
  const result = await client.query(`SELECT k.fingerprint,b.* FROM booking_request_keys k
    JOIN bookings b ON b.id=k.booking_id
    WHERE k.customer_id=$1 AND k.request_id=$2::uuid`, [customerId, requestId]);
  if (!result.rowCount) return null;
  const { fingerprint: priorFingerprint, ...booking } = result.rows[0];
  if (priorFingerprint !== signature) {
    throw new BookingSelectionError(409, 'Bu so‘rov identifikatori boshqa bron uchun ishlatilgan.', 'request_id_reused');
  }
  const details = await client.query(`SELECT service_id AS id,service_name AS name,price,duration_minutes
    FROM booking_services WHERE booking_id=$1 ORDER BY position`, [booking.id]);
  return { ...booking, services: details.rows, replayed: true };
}
async function saveBookingRequest(client, customerId, requestId, signature, bookingId) {
  if (requestId) await client.query(`INSERT INTO booking_request_keys(customer_id,request_id,fingerprint,booking_id)
    VALUES($1,$2::uuid,$3,$4)`, [customerId,requestId,signature,bookingId]);
}
async function requireIdempotencySchema(pool) {
  const result=await pool.query("SELECT to_regclass('booking_request_keys') IS NOT NULL AS ready");
  if (!result.rows[0]?.ready) throw new BookingSelectionError(503, 'Bronni takroriy yuborish himoyasi uchun database migratsiyasi kerak.', 'migration_required');
}
module.exports = { bookingRequest, fingerprint, replayBooking, saveBookingRequest, requireIdempotencySchema };
