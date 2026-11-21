'use strict';
// v46: finish/call-next and Smart Booking decisions share the barber advisory
// lock. Release only *unconfirmed* offers. Never alter a real confirmed booking.
// The caller owns the PostgreSQL transaction; errors MUST roll it back.
async function cancelUnconfirmedQueueOffers(client,entryId){
 const changed=await client.query(`UPDATE smart_booking_offers f
  SET status='cancelled',decided_at=clock_timestamp()
  WHERE f.entry_id=$1 AND f.status IN ('pending','accepted')
    AND NOT EXISTS(SELECT 1 FROM smart_booking_confirmations x WHERE x.offer_id=f.id)
  RETURNING f.id,f.opening_id`,[entryId]);
 const offerIds=changed.rows.map(r=>r.id);
 const openingIds=[...new Set(changed.rows.map(r=>r.opening_id))];
 if(openingIds.length){
  await client.query(`UPDATE smart_booking_openings SET state='open',
   next_check_at=clock_timestamp(),updated_at=clock_timestamp()
   WHERE id=ANY($1::bigint[]) AND state IN ('offered','accepted')`,[openingIds]);
  await client.query(`UPDATE smart_booking_telegram_outbox SET status='cancelled',
   lease_owner=NULL,lease_until=NULL
   WHERE offer_id=ANY($1::bigint[]) AND status='pending'`,[offerIds]);
 }
 return {cancelled_offers:offerIds.length};
}
// Safe on first finish and on a replay: only unconfirmed offers and pending
// deliveries are changed. No confirmed booking is touched or re-created.
async function cleanupTerminalQueue(client,entryId){
 const result=await cancelUnconfirmedQueueOffers(client,entryId);
 await client.query(`UPDATE walkin_queue_notification_outbox SET status='cancelled',
   lease_owner=NULL,lease_until=NULL WHERE entry_id=$1 AND status IN ('pending','processing')`,[entryId]);
 await client.query('DELETE FROM walkin_queue_telegram_subscriptions WHERE entry_id=$1',[entryId]);
 await client.query('DELETE FROM walkin_queue_telegram_invites WHERE entry_id=$1',[entryId]);
 return result;
}
module.exports={cancelUnconfirmedQueueOffers,cleanupTerminalQueue};
