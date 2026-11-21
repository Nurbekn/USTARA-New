const {serviceIds,selectedServices,expectedPriceMatches,expectedDurationMatches,fail}=require('./bookingSelection');
const {validDate,parseBookingTime,minutes,timeString}=require('../utils/bookingTime');
const {bookingRequest,fingerprint,replayBooking,saveBookingRequest}=require('./bookingIdempotency');
const {slotCandidates}=require('./slotGrid');
const {bookingDbConflict}=require('./bookingDbConflicts');
const {fitsBooking,dayHours,withBreakBusy}=require('./calendarSchedule');
const {checkExpectedCancellationPolicy}=require('./cancellationTerms');
async function createMultiBooking(pool,actor,body) {
 const ids=serviceIds(body.service_ids),barber=body.barber_id,start=parseBookingTime(body.booking_time);
 const requestId=bookingRequest(body),signature=requestId?fingerprint(barber,ids,body.booking_time):null;
 if(actor?.role!=='customer')throw fail(403,'Faqat mijoz bron yaratadi.');
 if(!Number.isSafeInteger(barber)||barber<=0||barber>2147483647||!Number.isFinite(start)||start%300000)throw fail(400,'Sartarosh yoki bron vaqti noto‘g‘ri.');
 if(!Number.isSafeInteger(actor?.profileId)||actor.profileId<=0||actor.profileId>2147483647)throw fail(401,'Mijoz sessiyasi yaroqsiz.','invalid_session');
 const client=await pool.connect();let broken=false,commitStarted=false;
 const commit=async()=>{commitStarted=true;await client.query('COMMIT');commitStarted=false;};
 try{
  await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='15s'");
  const customer=await client.query('SELECT user_id FROM customers WHERE id=$1 FOR UPDATE',[actor.profileId]);
  if(customer.rows[0]?.user_id!==(actor.accountId??actor.id))throw fail(401,'Mijoz sessiyasi yaroqsiz.');
  const account=await client.query("SELECT id FROM users WHERE id=$1 AND role='customer' AND deactivated_at IS NULL FOR SHARE",[actor.accountId??actor.id]);
  if(!account.rowCount)throw fail(401,'Mijoz sessiyasi yaroqsiz.');
  const replay=await replayBooking(client,actor.profileId,requestId,signature);
  if(replay){await commit();return replay;}
  await client.query('SELECT pg_advisory_xact_lock($1)',[barber]);
  const owner=await client.query('SELECT verification_status,accepting_bookings,cancellation_cutoff_minutes,cancellation_policy_text,clock_timestamp() AS now FROM barbers WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=barbers.user_id AND u.deactivated_at IS NOT NULL) FOR SHARE',[barber]);
  if(owner.rows[0]?.verification_status!=='approved')throw fail(403,'Sartarosh hali tasdiqlanmagan.');
  if(!owner.rows[0].accepting_bookings)throw fail(409,'Sartarosh yangi bron qabul qilmayapti.','bookings_paused');
  const terms=checkExpectedCancellationPolicy(body,owner.rows[0]);
  if(!terms.ok)throw fail(terms.status,terms.message,terms.code);
  // Row lock is acquired after the barber lock, same order as account pause.
  const barberOwner = await client.query('SELECT user_id FROM barbers WHERE id=$1', [barber]);
  const activeBarber = await client.query('SELECT id FROM users WHERE id=$1 AND deactivated_at IS NULL FOR SHARE', [barberOwner.rows[0].user_id]);
  if(!activeBarber.rowCount)throw fail(409,'Sartaroshning akkaunti vaqtincha faolsiz.','barber_deactivated');
  if(start<=+new Date(owner.rows[0].now))throw fail(400,'Bron vaqti o‘tib ketgan.');
  const selection=await selectedServices(client,barber,ids,true);
  if(!expectedPriceMatches(body.expected_total_price,selection.totalPrice))
    throw fail(409,'Xizmat narxi o‘zgargan. Yangi narxni ko‘rib, bronni qayta tasdiqlang.','price_changed');
  if(!expectedDurationMatches(body.expected_duration_minutes,selection.duration))
    throw fail(409,'Xizmat davomiyligi o‘zgargan. Yangilangan vaqtni ko‘rib, qayta tasdiqlang.','duration_changed');
  const time=new Date(start).toISOString(),end=new Date(start+selection.duration*60000).toISOString();
  if(!await fitsBooking(client,barber,time,selection.duration))throw fail(409,'Tanaffus, ta’til yoki ish vaqtidan tashqari.','outside_work_hours');
  const busy=await client.query(`SELECT id FROM bookings WHERE barber_id=$1 AND status IN ('pending','confirmed')
    AND booking_time<$3::timestamptz AND booking_time+duration_minutes*INTERVAL '1 minute'>$2::timestamptz`,[barber,time,end]);
  if(busy.rowCount)throw fail(409,'Bu vaqt band.','booking_conflict');
  // Same customer-row lock as the single-service flow: even two different
  // barbers cannot be booked at overlapping times by the same customer.
  const customerBusy=await client.query(`SELECT id FROM bookings WHERE customer_id=$1
    AND status IN ('pending','confirmed')
    AND booking_time<$3::timestamptz AND booking_time+duration_minutes*INTERVAL '1 minute'>$2::timestamptz
    LIMIT 1`,[actor.profileId,time,end]);
  if(customerBusy.rowCount)throw fail(409,'Sizning boshqa bronga vaqtingiz to‘qnashyapti.','customer_time_conflict');
  const clock=await client.query('SELECT clock_timestamp() AS now');if(start<=+new Date(clock.rows[0].now))throw fail(400,'Bron vaqti o‘tib ketgan.');
  const inserted=await client.query(`INSERT INTO bookings(customer_id,barber_id,service_id,booking_time,duration_minutes,total_price,status)
    VALUES($1,$2,$3,$4,$5,$6,'confirmed') RETURNING *`,[actor.profileId,barber,ids[0],time,selection.duration,selection.totalPrice]);
  const booking=inserted.rows[0];
  for(let position=0;position<selection.services.length;position++){
   const s=selection.services[position];await client.query('INSERT INTO booking_services(booking_id,position,service_id,service_name,price,duration_minutes) VALUES($1,$2,$3,$4,$5,$6)',[booking.id,position,s.id,s.name,s.price,s.duration_minutes]);
  }
  await saveBookingRequest(client,actor.profileId,requestId,signature,booking.id);
  await commit();return {...booking,services:selection.services};
 }catch(error){if(commitStarted)broken=true;try{await client.query('ROLLBACK');}catch{broken=true;}const conflict=bookingDbConflict(error);if(conflict)throw conflict;throw error;}finally{client.release(broken);}
}
async function multiSlots(pool,query) {
 // Public availability must accept canonical decimal IDs only: Number('0x10') and
 // Number('1e2') otherwise silently select another barber/service.
 const decimalId = value => typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value)
   ? Number(value) : NaN;
 const rawServices = query.service_ids;
 const ids=serviceIds(typeof rawServices==='string'
   ? rawServices.split(',').map(decimalId) : rawServices);
 const barber=decimalId(query.barber_id),date=query.date;
 if(!Number.isSafeInteger(barber)||barber<=0||barber>2147483647||!validDate(date))throw fail(400,'Sartarosh yoki sana noto‘g‘ri.');
 const client=await pool.connect();let broken=false,commitStarted=false;
 const commit=async()=>{commitStarted=true;await client.query('COMMIT');commitStarted=false;};
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='15s'");
  const owner=await client.query('SELECT verification_status,accepting_bookings FROM barbers WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=barbers.user_id AND u.deactivated_at IS NOT NULL)',[barber]);
  if(owner.rows[0]?.verification_status!=='approved')throw fail(403,'Sartarosh hali tasdiqlanmagan.');
  const selection=await selectedServices(client,barber,ids),base={date,duration:selection.duration,total_price:selection.totalPrice,service_ids:ids,slots:[],candidates:[],working:false,accepting_bookings:owner.rows[0].accepting_bookings};
  if(!base.accepting_bookings){await commit();return base;}
  const hours=await dayHours(client,barber,date);
  if(!hours.rowCount){await commit();return base;}
  const h=hours.rows[0],from=minutes(h.start_time),to=minutes(h.end_time);
  const reserved=await client.query(`SELECT EXTRACT(EPOCH FROM ((booking_time AT TIME ZONE 'Asia/Tashkent')-$2::date))/60 AS start,
    EXTRACT(EPOCH FROM (((booking_time+duration_minutes*INTERVAL '1 minute') AT TIME ZONE 'Asia/Tashkent')-$2::date))/60 AS end
    FROM bookings WHERE barber_id=$1 AND status IN ('pending','confirmed') AND booking_time<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Tashkent')
    AND booking_time+duration_minutes*INTERVAL '1 minute'>($2::date::timestamp AT TIME ZONE 'Asia/Tashkent')`,[barber,date]);
  const candidates=slotCandidates({workStart:from,workEnd:to,duration:selection.duration,nowMinutes:Number(h.now_minutes),busy:withBreakBusy(reserved.rows.map(b=>({start:Number(b.start),end:Number(b.end)})),h)})
    .map(slot=>({start:timeString(slot.start),end:timeString(slot.end),available:slot.available}));
  // This route is public, including when an Authorization header is supplied.
  // Do not expose unavailable candidates: their timing reveals occupied blocks.
  const available=candidates.filter(slot=>slot.available);
  await commit();return {...base,working:true,candidates:available,slots:available.map(({start,end})=>({start,end}))};
 }catch(error){if(commitStarted)broken=true;try{await client.query('ROLLBACK');}catch{broken=true;}throw bookingDbConflict(error) || error;}finally{client.release(broken);}
}
module.exports={createMultiBooking,multiSlots};
