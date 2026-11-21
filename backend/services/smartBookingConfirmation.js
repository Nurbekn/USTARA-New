'use strict';
const {selectedServices,serviceIds,expectedPriceMatches}=require('./bookingSelection');
const {fitsBooking}=require('./calendarSchedule');
const {bookingDbConflict}=require('./bookingDbConflicts');
const {transaction,lockBarber,slotIsTaken,tokenHash,requestHash,fail,positive}=require('./smartBookingOffers');
const isQr=s=>typeof s==='string'&&/^[a-f0-9]{48}$/.test(s);
const isReceipt=s=>typeof s==='string'&&/^[a-f0-9]{32}$/.test(s);
const isPrice=v=>(typeof v==='string'||typeof v==='number') && /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(String(v));
const minutes=2;
const {customerActor,ownedEntry}=require('./manualQueueClaims');

async function ticketOwner(c,token,requestId,{locked=false}={}){
 if(!isQr(token)||!isReceipt(requestId))throw fail(400,'invalid_ticket','QR tasdig‘i noto‘g‘ri.');
 const qr=await c.query(`SELECT q.id AS entry_id,q.barber_id
  FROM walkin_qr_requests r JOIN walkin_qr_tokens t ON t.id=r.qr_token_id
  JOIN walkin_queue q ON q.id=r.queue_entry_id
  WHERE t.token_hash=$1 AND r.request_hash=$2 AND r.status='approved'
  ${locked?'FOR SHARE OF r':''}`,
 [tokenHash(token),requestHash(requestId)]);
 if(!qr.rowCount)throw fail(404,'ticket_missing','QR navbat topilmadi.');
 return qr.rows[0];
}
function createSmartBookingConfirmation(db){
 db=db||require('../db');
 async function services({token,request_id,offer_id,multi_service,actor,manual=false}){
  const id=positive(offer_id);if(!id)throw fail(400,'invalid_offer','Taklif ID noto‘g‘ri.');
  // Ticket ownership is needed even to see this private opening.
  return transaction(db,async c=>{
   let owner;
   if(manual){
    const identity=customerActor(actor);
    const account=await c.query(`SELECT c.id FROM customers c JOIN users u ON u.id=c.user_id
     WHERE c.id=$1 AND c.user_id=$2 AND u.role='customer' AND u.deactivated_at IS NULL
     FOR SHARE OF c,u`,[identity.customerId,identity.userId]);
    if(!account.rowCount)throw fail(401,'invalid_session','Mijoz sessiyasi yaroqsiz.');
    owner=await ownedEntry(c,id,identity.customerId,{locked:true});
   }else owner=await ticketOwner(c,token,request_id,{locked:true});
   const result=await c.query(`SELECT o.barber_id,o.duration_minutes,o.start_at,f.decided_at,
     (clock_timestamp() < f.decided_at+interval '2 minutes') AS valid
    FROM smart_booking_offers f JOIN smart_booking_openings o ON o.id=f.opening_id
    JOIN walkin_queue q ON q.id=f.entry_id
    WHERE f.id=$1 AND f.entry_id=$2 AND o.barber_id=$3
      AND f.status='accepted' AND o.state='accepted' AND q.status='waiting'
      AND q.queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date`,
    [id,owner.entry_id,owner.barber_id]);
   if(!result.rowCount||result.rows[0].valid!==true)throw fail(410,'confirmation_expired','Bron tasdiqlash vaqti tugagan.');
   const offer=result.rows[0];
   // The customer may combine up to 20 active services. Final validation and
   // price calculation happen again under DB locks in confirm(), never in UI.
   const options=await c.query(`SELECT id,name,price,duration_minutes FROM services s
    WHERE barber_id=$1 AND ${multi_service===true?'duration_minutes BETWEEN 5 AND $2':'duration_minutes=$2'}
      AND duration_minutes % 5=0 AND price>0
      AND COALESCE((to_jsonb(s)->>'is_active')::boolean,TRUE)
    ORDER BY id LIMIT 100`,[owner.barber_id,offer.duration_minutes]);
   return {expires_at:new Date(new Date(offer.decided_at).getTime()+minutes*60000).toISOString(),
     starts_at:offer.start_at,duration_minutes:Number(offer.duration_minutes),
     max_services:20,services:options.rows.map(s=>({id:s.id,name:s.name,price:s.price,duration_minutes:s.duration_minutes}))};
  });
 }
 async function confirm({token,request_id,offer_id,service_id,service_ids,expected_total_price,actor,manual=false}){
  const offerId=positive(offer_id);
  // Preserve v27 single-service clients, but never let two contradictory
  // request formats silently select different services.
  if(service_ids!==undefined && service_id!==undefined)
   throw fail(400,'invalid_selection','Xizmatlarni faqat bitta formatda yuboring.');
  const ids=service_ids!==undefined?service_ids:[positive(service_id)];
  if(!offerId||!Array.isArray(ids)||ids.some(id=>!Number.isSafeInteger(id)||id>2147483647)||
     !isPrice(expected_total_price)||Number(expected_total_price)<=0)
   throw fail(400,'invalid_selection','Xizmat va tasdiqlangan narxni tanlang.');
  try{serviceIds(ids);}catch{throw fail(400,'invalid_selection','Xizmatlarni to‘g‘ri tanlang.');}
  const customerId=positive(actor?.profileId),userId=positive(actor?.accountId??actor?.id);
  if(actor?.role!=='customer'||!customerId||!userId)throw fail(403,'customer_required','Bron uchun mijoz hisobiga kiring.');
  try{return await transaction(db,async c=>{
   // QR proof and customer-claimed manual tickets use separate, explicit routes.
   const owner=manual?await ownedEntry(c,offerId,customerId,{allowConfirmedReplay:true}):await ticketOwner(c,token,request_id);
   // Standard booking path locks customer before barber: preserve lock ordering.
   const account=await c.query(`SELECT c.id FROM customers c JOIN users u ON u.id=c.user_id
    WHERE c.id=$1 AND c.user_id=$2 AND u.role='customer' AND u.deactivated_at IS NULL
    FOR UPDATE OF c,u`,[customerId,userId]);
   if(!account.rowCount)throw fail(401,'invalid_session','Mijoz sessiyasi yaroqsiz.');
   await lockBarber(c,owner.barber_id);
   // A customer may have revoked a manual ticket while this request waited.
   if(manual)await ownedEntry(c,offerId,customerId,{allowConfirmedReplay:true});
   const locked=await c.query(`SELECT f.id,f.status,f.decided_at,f.expires_at,
     o.id AS opening_id,o.barber_id,o.start_at,o.duration_minutes,o.state,
     q.id AS entry_id,q.status AS queue_status,q.queue_date
    FROM smart_booking_offers f JOIN smart_booking_openings o ON o.id=f.opening_id
    JOIN walkin_queue q ON q.id=f.entry_id
    WHERE f.id=$1 AND f.entry_id=$2 AND o.barber_id=$3
    FOR UPDATE OF f,o,q`,[offerId,owner.entry_id,owner.barber_id]);
   if(!locked.rowCount)throw fail(404,'offer_missing','Taklif topilmadi.');
   const offer=locked.rows[0];
   // Revocation can happen while waiting on the barber/offer locks. Only the
   // manual branch had a second check; QR ownership must be revalidated too.
   if(!manual){
    const fresh=await ticketOwner(c,token,request_id,{locked:true});
    if(Number(fresh.entry_id)!==Number(offer.entry_id) ||
       Number(fresh.barber_id)!==Number(offer.barber_id))
      throw fail(403,'ticket_revoked','QR navbat tasdig‘i bekor qilingan.');
   }
   const previous=await c.query(`SELECT x.customer_id,b.id AS booking_id,b.status
    FROM smart_booking_confirmations x JOIN bookings b ON b.id=x.booking_id WHERE x.offer_id=$1`,[offerId]);
   if(previous.rowCount){
    if(Number(previous.rows[0].customer_id)!==customerId)throw fail(409,'already_booked','Taklif boshqa hisob bilan tasdiqlangan.');
    return {booking_id:previous.rows[0].booking_id,status:previous.rows[0].status,replayed:true};
   }
   if(offer.status!=='accepted'||offer.state!=='accepted'||offer.queue_status!=='waiting')
    throw fail(409,'not_accepted','Avval 5 daqiqalik taklifni qabul qiling.');
   const clock=await c.query('SELECT clock_timestamp() AS now');
   const now=new Date(clock.rows[0]?.now).getTime();
   if(!Number.isFinite(now))throw fail(503,'db_clock_unavailable','Database vaqti olinmadi.');
   if(new Date(offer.decided_at).getTime()+minutes*60000<=now ||
      new Date(offer.start_at).getTime()<=now+5*60000)
    throw fail(410,'confirmation_expired','Tasdiqlash muddati tugagan.');
   const today=await c.query(`SELECT ($1::date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date) AS today`,[offer.queue_date]);
   if(today.rows[0]?.today!==true)throw fail(410,'ticket_expired','Bugungi navbat faol emas.');
   const barber=await c.query(`SELECT b.id,b.accepting_bookings,b.verification_status FROM barbers b
    JOIN users u ON u.id=b.user_id WHERE b.id=$1 AND u.role='barber' AND u.deactivated_at IS NULL
    FOR SHARE OF b,u`,[owner.barber_id]);
   if(barber.rows[0]?.verification_status!=='approved'||barber.rows[0].accepting_bookings!==true)
    throw fail(409,'barber_unavailable','Sartarosh hozir bron qabul qilmayapti.');
   const selection=await selectedServices(c,owner.barber_id,ids,true);
   if(selection.duration!==Number(offer.duration_minutes))
    throw fail(409,'duration_mismatch','Xizmat davomiyligi bo‘shagan vaqtga mos kelmaydi.');
   if(!expectedPriceMatches(expected_total_price,selection.totalPrice))
    throw fail(409,'price_changed','Xizmat narxi o‘zgardi. Qayta tekshiring.');
   const start=new Date(offer.start_at).toISOString();
   if(!await fitsBooking(c,owner.barber_id,start,selection.duration))
    throw fail(409,'outside_work_hours','Bu vaqt ish vaqti yoki tanaffusga mos emas.');
   if(await slotIsTaken(c,offer))throw fail(409,'slot_taken','Bu vaqt boshqa bron bilan band bo‘lgan.');
   const overlap=await c.query(`SELECT 1 FROM bookings WHERE customer_id=$1 AND status IN ('pending','confirmed')
    AND booking_time<$3::timestamptz
    AND booking_time+duration_minutes*interval '1 minute'>$2::timestamptz LIMIT 1`,
    [customerId,start,new Date(new Date(start).getTime()+selection.duration*60000).toISOString()]);
   if(overlap.rowCount)throw fail(409,'customer_time_conflict','Sizning boshqa broningiz bilan vaqt to‘qnashyapti.');
   // v52: the definitive reservation write must satisfy the deadline too.
   // Preliminary checks can be slow; a snapshot-time check alone is unsafe.
   const inserted=await c.query(`INSERT INTO bookings(customer_id,barber_id,service_id,booking_time,
     duration_minutes,total_price,status)
    SELECT $1,$2,$3,$4,$5,$6,'confirmed'
    FROM smart_booking_offers f JOIN smart_booking_openings o ON o.id=f.opening_id
      JOIN walkin_queue q ON q.id=f.entry_id
    WHERE f.id=$7 AND f.status='accepted' AND o.state='accepted'
      AND q.id=$8 AND q.status='waiting' AND q.barber_id=$2
      AND q.queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
      AND clock_timestamp()<f.decided_at+interval '2 minutes'
      AND o.start_at>clock_timestamp()+interval '5 minutes'
    RETURNING id,status`,
    [customerId,owner.barber_id,ids[0],start,selection.duration,selection.totalPrice,offerId,offer.entry_id]);
   if(inserted.rowCount!==1)throw fail(410,'confirmation_expired','Tasdiqlash muddati tugagan.');
   const bookingId=inserted.rows[0].id;
   for(const [position,s] of selection.services.entries()){
    await c.query(`INSERT INTO booking_services(booking_id,position,service_id,service_name,price,duration_minutes)
     VALUES($1,$2,$3,$4,$5,$6)`,[bookingId,position,s.id,s.name,s.price,s.duration_minutes]);
   }
   await c.query(`INSERT INTO smart_booking_confirmations(offer_id,booking_id,customer_id)
    VALUES($1,$2,$3)`,[offerId,bookingId,customerId]);
   await c.query(`UPDATE smart_booking_openings SET state='closed',updated_at=clock_timestamp() WHERE id=$1`,[offer.opening_id]);
   // Never commit a booking without atomically closing its waiting ticket.
   // Any failure rolls back the booking, snapshots and confirmation as one unit.
   const left=await c.query(`UPDATE walkin_queue SET status='left',finished_at=clock_timestamp()
    WHERE id=$1 AND status='waiting' RETURNING id`,[offer.entry_id]);
   if(left.rowCount!==1)throw fail(409,'queue_changed','Navbat holati o‘zgargan. Qayta tekshiring.');
   // A completed booking ends the walk-in session. Cancel only NOT-YET-SENT
   // queue notifications; an in-flight network call cannot be recalled.
   await c.query(`UPDATE walkin_queue_notification_outbox
    SET status='cancelled',lease_owner=NULL,lease_until=NULL
    WHERE entry_id=$1 AND status IN ('pending','processing')`,[offer.entry_id]);
   await c.query(`UPDATE smart_booking_telegram_outbox SET status='cancelled'
    WHERE offer_id=$1 AND status='pending'`,[offerId]);
   await c.query('DELETE FROM walkin_queue_telegram_subscriptions WHERE entry_id=$1',[offer.entry_id]);
   await c.query('DELETE FROM walkin_queue_telegram_invites WHERE entry_id=$1',[offer.entry_id]);
   // v37 audit column: the *customer* ended the queue by confirming a booking,
   // not a staff member. Keep that attribution inside the booking transaction.
   await c.query(`INSERT INTO walkin_queue_events(entry_id,actor_user_id,action,actor_source)
    VALUES($1,$2,'left','customer')`,[offer.entry_id,userId]);
   return {booking_id:bookingId,status:'confirmed',replayed:false};
  });}catch(e){throw bookingDbConflict(e)||e;}
 }
 return {services,confirm};
}
module.exports={createSmartBookingConfirmation};
