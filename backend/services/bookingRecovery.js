'use strict';
// #144: Read-only recovery of an uncertain POST. A negative lookup is NOT
// proof that a concurrent request can no longer commit.
const {bookingRequest,requireIdempotencySchema} = require('./bookingIdempotency');
const {attachBookingServices,fail} = require('./bookingSelection');

async function recoverBooking(pool,actor,requestId) {
  if (actor?.role !== 'customer' || !Number.isSafeInteger(actor.profileId)
      || actor.profileId <= 0 || actor.profileId > 2147483647)
    throw fail(403,'Faqat mijoz o‘z bronini tiklay oladi.','forbidden');
  const key=bookingRequest({request_id:requestId ?? null});
  await requireIdempotencySchema(pool);
  const result=await pool.query(`SELECT b.* FROM booking_request_keys k
    JOIN bookings b ON b.id=k.booking_id
    WHERE k.customer_id=$1 AND k.request_id=$2::uuid AND b.customer_id=$1`,
    [actor.profileId,key]);
  if (!result.rowCount) return {found:false,uncertain:true};
  const [booking]=await attachBookingServices([result.rows[0]],pool);
  return {found:true,data:{...booking,replayed:true}};
}
module.exports={recoverBooking};
