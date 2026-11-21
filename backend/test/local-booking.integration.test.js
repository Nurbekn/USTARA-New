const {test}=require('node:test');
const {createLocalBookingHarness}=require('./helpers/localBooking');
const enabled=process.env.USTARA_LOCAL_BOOKING_WRITE_TESTS==='I_AUTHORIZE_TEST_DATA';
function safePgMessage(error){
 const message=String(error?.message||'');
 if(/^conflicting key value violates exclusion constraint "[A-Za-z0-9_]+"$/.test(message))return message;
 if(/^permission denied for (?:table|sequence|schema) [A-Za-z0-9_."]+$/.test(message))return message;
 if(/^permission denied to set parameter "[A-Za-z0-9_.-]+"$/.test(message))return message;
 return error?'PostgreSQL error (details suppressed)':'No PostgreSQL error';
}
test('local ustara_test_db booking API and Telegram transport (real PostgreSQL)',{skip:!enabled},async(t)=>{
 let h;try{h=await createLocalBookingHarness();}catch(e){throw new Error(e.message);}
 t.after(async()=>{try{await h.close();}catch{throw new Error('ID-scoped booking cleanup or preservation verification failed; see private report');}});
 const {check,control:q}=h;
 async function scenario(name,work){await t.test(name,()=>h.scenario(name,work));check(h.report.cases.at(-1)?.status==='PASS','Stop after failed booking case; cleanup remains registered');}
 const customers=[await h.person('customer'),await h.person('customer')];
 const barbers=[await h.person('barber'),await h.person('barber'),await h.person('barber',false)];
 const [customer,otherCustomer]=customers,[barber,otherBarber,pendingBarber]=barbers;
 const services=[];
 for(const [owner,duration] of [[barber,30],[barber,60],[otherBarber,30],[pendingBarber,30]]){
  services.push(await h.insert('services',['barber_id','name','price','duration_minutes'],[owner.profileId,'BookingTest'+h.report.run,100000,duration]));
 }
 const clock=(await q.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'Asia/Tashkent','YYYY-MM-DD') AS today,
   extract(dow FROM clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::int AS dow`)).rows[0];
 const add=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
 const monday=add(clock.today,(1-clock.dow+7)%7+7),date=(week=0)=>add(monday,week*7);
 const offDow=[2,3,4,5,6,0].find(d=>d!==clock.dow),offDate=add(monday,(offDow-1+7)%7);
 const at=(d,time)=>`${d}T${time}:00+05:00`;
 for(const b of barbers){
  await h.insert('barber_working_hours',['barber_id','day_of_week','start_time','end_time'],[b.profileId,1,'09:00','18:00']);
  if(clock.dow!==1)await h.insert('barber_working_hours',['barber_id','day_of_week','start_time','end_time'],[b.profileId,clock.dow,'00:00','23:59']);
 }
 let chat;do{chat=800000000000+require('node:crypto').randomInt(1000000000);}while((await q.query('SELECT 1 FROM barber_telegram_links WHERE chat_id=$1',[chat])).rowCount);
 await h.insert('barber_telegram_links',['barber_id','chat_id','linked_at'],[barber.profileId,chat,new Date()]);
 const missing=2147483646;check(!(await q.query('SELECT 1 FROM services WHERE id=$1',[missing])).rowCount,'Missing service ID must actually be absent');
 const available=(d=date(),serviceId=services[0],b=barber,actor=customer)=>h.call('GET',`/api/bookings/available-slots?barber_id=${b.profileId}&service_id=${serviceId}&date=${d}`,undefined,actor);
 const book=(d,time='10:00',serviceId=services[0],b=barber,actor=customer,extra={})=>h.call('POST','/api/bookings',{barber_id:b.profileId,service_id:serviceId,booking_time:at(d,time),...extra},actor);
 const update=(id,status,actor=barber)=>h.call('PUT',`/api/bookings/${id}`,{status},actor);
 const stored=async id=>(await q.query('SELECT * FROM bookings WHERE id=$1',[id])).rows[0];
 const has=(result,time)=>result.body.slots.some(s=>s.start===time);
 async function created(d,time='10:00',serviceId=services[0],b=barber,actor=customer){const result=await book(d,time,serviceId,b,actor);check(result.status===201,'Booking fixture created through real HTTP');return result.body.data.id;}

 await scenario('available slots respect weekly hours, day off, duration and shift end',async()=>{
  const slots=await available();check(slots.status===200&&slots.body.working&&slots.body.duration===30,'Working day offers selected service duration');
  check(slots.body.slots[0].start==='09:00'&&slots.body.slots[0].end==='09:30','First slot starts at work opening');
  check(slots.body.slots.at(-1).start==='17:30'&&slots.body.slots.at(-1).end==='18:00','Last full 30-minute slot fits shift end');
  const longer=await available(date(),services[1]);check(longer.status===200&&longer.body.duration===60&&longer.body.slots.at(-1).start==='17:00','60-minute service has different available end boundary');
  const off=await available(offDate);check(off.status===200&&off.body.working===false&&off.body.slots.length===0,'Missing weekday is day off');
 });
 await scenario('past dates and elapsed current-day times are never offered',async()=>{
  const lastMonday=add(monday,-21);const past=await available(lastMonday);
  check(past.status===200&&past.body.working&&past.body.slots.length===0,'Past working date has no available slots');
  const before=(await q.query("SELECT extract(epoch FROM ((clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::time))/60 AS minutes")).rows[0].minutes;
  const today=await available(clock.today);check(today.status===200,'Current-day availability succeeds');
  check(today.body.slots.every(s=>Number(s.start.slice(0,2))*60+Number(s.start.slice(3))>Number(before)),'Every offered current-day start is strictly in future');
 });
 await scenario('invalid/cross-barber service, calendar date and unapproved barber are rejected',async()=>{
  check((await available(date(),services[2])).status===404,'Service owned by another barber is not available');
  check((await available(date(),missing)).status===404,'Missing service not available');
  check((await available('2030-02-30')).status===400,'Invalid calendar date rejected');
  check((await available(date(),services[3],pendingBarber)).status===403,'Unapproved barber has no availability');
  check((await available(date(),services[0],barber,null)).status===401,'Anonymous availability rejected');
 });
 await scenario('create stores snapshot and canonical Tashkent instant; linked notification sees committed row',async()=>{
  const first=h.report.telegram.length;
  const result=await book(date(1),'10:00',services[0],barber,customer,{duration_minutes:999,customer_id:otherCustomer.profileId});
  check(result.status===201,'Valid booking returns 201');const id=result.body.data.id,row=await stored(id);
  check(row.customer_id===customer.profileId&&row.duration_minutes===30&&row.status==='pending','Server derives customer and duration, ignores forged payload values');
  check(+row.booking_time===Date.parse(at(date(1),'10:00'))&&row.booking_time.toISOString().includes('T05:00:00'),'Asia/Tashkent 10:00 is stored as UTC 05:00');
  const message=h.report.telegram.slice(first).find(e=>e.method==='sendMessage');
  check(message?.bookingId===id&&message.committedVisibleFromOtherConnection,'Notification transport reads committed booking from separate connection');
  check(message.buttons.join(',')==='confirmed,rejected'&&message.containsTashkent&&message.notificationFieldsPresent,'Message has existing customer/service/time fields and inline review actions');
  const one=await h.call('GET',`/api/bookings/${id}`,undefined,customer);
  check(one.status===200&&Date.parse(one.body.booking_end)-Date.parse(one.body.booking_time)===1800000,'Read API exposes snapshot-based end time');
  const list=await h.call('GET','/api/bookings',undefined,customer);check(list.status===200&&list.body.some(b=>b.id===id),'Customer booking list contains own booking');
  check((await h.call('GET',`/api/bookings/${id}`,undefined,otherCustomer)).status===404,'Other customer cannot read booking');
  const utc=new Date(Date.parse(at(date(1),'10:00'))).toISOString();
  check((await book(date(1),'10:00',services[0],barber,customer,{booking_time:utc})).status===409,'Equivalent UTC instant conflicts with same local slot');
 });
 await scenario('unlinked barber booking succeeds without notification',async()=>{
  const before=h.report.telegram.length;await created(date(1),'10:00',services[2],otherBarber);
  check(h.report.telegram.length===before,'No Telegram transport call for unlinked barber');
 });
 await scenario('invalid create requests rollback without partial booking rows',async()=>{
  const before=h.ids.bookings.length;
  for(const [body,status,actor] of [
   [{barber_id:barber.profileId,service_id:0,booking_time:at(date(2),'10:00')},400,customer],
   [{barber_id:barber.profileId,service_id:missing,booking_time:at(date(2),'10:00')},404,customer],
   [{barber_id:barber.profileId,service_id:services[2],booking_time:at(date(2),'10:00')},404,customer],
   [{barber_id:pendingBarber.profileId,service_id:services[3],booking_time:at(date(2),'10:00')},403,customer],
   [{barber_id:barber.profileId,service_id:services[0],booking_time:at(date(2),'10:00')},403,barber],
   [{barber_id:barber.profileId,service_id:services[0],booking_time:at(date(2),'10:00')},401,null],
   [{barber_id:barber.profileId,service_id:services[0],booking_time:date(2)+'T10:00:00'},400,customer]
  ])check((await h.call('POST','/api/bookings',body,actor)).status===status,'Invalid create returns exact expected HTTP status');
  check(h.ids.bookings.length===before&&(await q.query('SELECT count(*)::int AS n FROM bookings WHERE barber_id=$1 AND booking_time=$2',[barber.profileId,at(date(2),'10:00')])).rows[0].n===0,'Rejected creates leave no partial booking');
 });
 await scenario('create rejects day off, outside-hours, insufficient remaining duration and past time',async()=>{
  check((await book(offDate)).status===400,'Day off booking rejected');
  for(const time of ['08:55','18:00','17:45'])check((await book(date(2),time)).status===400,'Outside/insufficient shift time rejected');
  check((await book(add(monday,-21))).status===400,'Past booking rejected using DB clock');
 });
 await scenario('pending and confirmed occupy full intervals; boundary-touching bookings are allowed',async()=>{
  const id=await created(date(3));let slots=await available(date(3));
  check(!has(slots,'10:00')&&!has(slots,'10:15')&&has(slots,'09:30')&&has(slots,'10:30'),'Pending occupies half-open snapshot interval');
  check(slots.body.busy.some(b=>b.start==='10:00'&&b.end==='10:30'),'Busy interval displayed in Tashkent');
  check((await book(date(3))).status===409&&(await book(date(3),'10:15')).status===409,'Duplicate and partially overlapping creates rejected');
  check((await update(id,'confirmed')).status===200,'Owner barber confirms');slots=await available(date(3));check(!has(slots,'10:00'),'Confirmed remains busy');
  await created(date(3),'10:30');
 });
 await scenario('PostgreSQL exclusion constraint independently rejects an overlapping direct insert',async()=>{
  const id=await created(date(15));const existingRow=await stored(id);
  const constraint=(await q.query(`SELECT c.conname,c.contype,c.convalidated,c.condeferrable,c.condeferred,
      pg_catalog.pg_get_constraintdef(c.oid,true) AS definition,
      pg_catalog.pg_get_indexdef(c.conindid) AS index_definition
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid='public.bookings'::pg_catalog.regclass AND c.conname='bookings_active_time_excl'`)).rows[0]||null;
  const attemptedStart=existingRow.booking_time.getTime();
  const attemptedDuration=existingRow.duration_minutes;
  const existingEnd=existingRow.booking_time.getTime()+existingRow.duration_minutes*60000;
  const attemptedEnd=attemptedStart+attemptedDuration*60000;
  const fixture={sameBarber:existingRow.barber_id===barber.profileId,
   differentCustomer:existingRow.customer_id!==otherCustomer.profileId,
   sameService:existingRow.service_id===services[0],sameStart:attemptedStart===existingRow.booking_time.getTime(),
   firstStatus:existingRow.status,secondStatus:'pending',firstDuration:existingRow.duration_minutes,
   secondDuration:attemptedDuration,intervalsOverlap:attemptedStart<existingEnd&&attemptedEnd>existingRow.booking_time.getTime()};
  const before=Number((await q.query('SELECT count(*) AS n FROM bookings WHERE barber_id=$1 AND booking_time=$2 AND status IN (\'pending\',\'confirmed\')',[barber.profileId,existingRow.booking_time])).rows[0].n);
  fixture.activeRowsAtTargetStart=before;
  const direct=await h.pool.connect();let insertError;
  try{
   await direct.query('BEGIN');
   try{
    await direct.query(`INSERT INTO bookings(customer_id,barber_id,service_id,booking_time,duration_minutes,status)
     VALUES($1,$2,$3,$4,$5,'pending')`,[otherCustomer.profileId,barber.profileId,services[0],existingRow.booking_time,existingRow.duration_minutes]);
   }catch(error){insertError=error;}
   await direct.query('ROLLBACK');
  }finally{direct.release();}
  const after=Number((await q.query('SELECT count(*) AS n FROM bookings WHERE barber_id=$1 AND booking_time=$2 AND status IN (\'pending\',\'confirmed\')',[barber.profileId,existingRow.booking_time])).rows[0].n);
  h.report.exclusionDiagnostic={constraint:constraint?{
    name:constraint.conname,type:constraint.contype,validated:constraint.convalidated,
    deferrable:constraint.condeferrable,deferred:constraint.condeferred,
    definition:constraint.definition,indexDefinition:constraint.index_definition,
   }:null,fixture,directInsert:{sqlstate:insertError?.code||null,safeMessage:safePgMessage(insertError),
    activeRowsBefore:before,activeRowsAfter:after,rollbackPreservedRows:after===before}};
  h.writeReport();
  check(constraint?.contype==='x'&&constraint.convalidated&&!constraint.condeferrable&&!constraint.condeferred,
   'Expected a validated, immediate bookings_active_time_excl constraint; see redacted catalog diagnostic');
  check(fixture.sameBarber&&fixture.differentCustomer&&fixture.sameService&&fixture.sameStart
    &&fixture.firstStatus==='pending'&&fixture.secondStatus==='pending'
    &&fixture.firstDuration>0&&fixture.firstDuration===fixture.secondDuration&&fixture.intervalsOverlap
    &&fixture.activeRowsAtTargetStart===1,
   'Direct insert fixture must overlap the existing pending booking for the same barber');
  check(insertError?.code==='23P01',`Database exclusion insert SQLSTATE=${insertError?.code||'none'}; ${safePgMessage(insertError)}`);
  check(after===before,'Rejected direct insert leaves no booking row behind');
 });
 await scenario('status ownership, allowed cancellation and terminal transition guards',async()=>{
  const id=await created(date(4));
  check((await update(id,'confirmed',otherBarber)).status===404,'Other barber cannot confirm');
  check((await update(id,'rejected',otherBarber)).status===404,'Other barber cannot reject');
  check((await update(id,'cancelled',otherCustomer)).status===404,'Other customer cannot cancel');
  check((await update(id,'confirmed',customer)).status===403,'Customer cannot confirm');
  check((await update(id,'confirmed',null)).status===401,'Anonymous status update rejected');
  check((await update(id,'approved')).status===400,'Unsupported approved alias rejected');
  check((await update(id,'completed')).status===400,'Pending cannot jump to completed');
  check((await update(id,'confirmed')).status===200,'Owner confirms pending');
  check((await update(id,'completed')).status===400,'Cannot complete before snapshot end');
  check((await update(id,'cancelled',customer)).status===200,'Owning customer cancels confirmed booking');
  check((await update(id,'confirmed')).status===400&&(await stored(id)).status==='cancelled','Cancelled booking cannot reactivate');
  check(has(await available(date(4)),'10:00'),'Cancelled releases availability');
 });
 await scenario('owner rejection releases time; repeated reject cannot corrupt terminal status',async()=>{
  const id=await created(date(5));check((await update(id,'rejected')).status===200,'Owner rejects pending');
  check((await update(id,'rejected')).status===400&&(await stored(id)).status==='rejected','Repeated reject leaves status unchanged');
  check(has(await available(date(5)),'10:00'),'Rejected releases availability');
 });
 await scenario('completed fixtures do not occupy slots; actual completion waits for saved duration',async()=>{
  const prepared=await h.seedBooking(customer,barber,services[0],at(date(6),'10:00'),30,'completed');
  check((await stored(prepared)).status==='completed'&&has(await available(date(6)),'10:00'),'Prepared completed booking is excluded from busy slots');
  const id=await created(date(6),'11:00');check((await update(id,'confirmed')).status===200,'Completion fixture confirmed through HTTP');
  h.owned('bookings',id);await q.query("UPDATE bookings SET booking_time=clock_timestamp()-duration_minutes*interval '1 minute'-interval '1 minute' WHERE id=$1",[id]);
  check((await update(id,'completed')).status===200&&(await stored(id)).status==='completed','Actual endpoint completes once stored snapshot duration elapsed');
 });
 await scenario('legacy DELETE cancels only own active booking without deleting history',async()=>{
  const id=await created(date(7));check((await h.call('DELETE',`/api/bookings/${id}`,undefined,otherCustomer)).status===404,'Other customer cannot use legacy cancellation');
  check((await h.call('DELETE',`/api/bookings/${id}`,undefined,customer)).status===200,'Owner legacy cancellation succeeds');
  check((await stored(id)).status==='cancelled'&&has(await available(date(7)),'10:00'),'Cancellation retains row and releases slot');
  check((await h.call('DELETE',`/api/bookings/${id}`,undefined,customer)).status===404,'Repeated legacy cancellation rejected');
 });
 await scenario('service edits never change old duration snapshots or conflict intervals',async()=>{
  const id=await created(date(8),'10:00',services[1]);check((await stored(id)).duration_minutes===60,'Booking snapshots original 60-minute service');
  h.owned('services',services[1]);await q.query('UPDATE services SET duration_minutes=15 WHERE id=$1',[services[1]]);
  check((await stored(id)).duration_minutes===60,'Old snapshot stays 60 after service edit');
  const slots=await available(date(8));check(!has(slots,'10:30')&&has(slots,'11:00'),'Availability uses saved 60-minute booking rather than edited service');
  check((await book(date(8),'10:30')).status===409,'Conflict check uses old booking duration');
  const next=await created(date(8),'11:00',services[1]);check((await stored(next)).duration_minutes===15,'New booking snapshots edited service duration');
 });
 await scenario('parallel creates serialize on real barber advisory lock and never overlap',async()=>{
  const results=await h.parallel('same slot create',barber.profileId,[()=>book(date(9)),()=>book(date(9),'10:00',services[0],barber,otherCustomer)]);
  check(results.map(r=>r.status).sort().join(',')==='201,409','Exactly one competing create succeeds; loser is 409');
  const rows=await q.query("SELECT id FROM bookings WHERE barber_id=$1 AND booking_time=$2 AND status IN ('pending','confirmed')",[barber.profileId,at(date(9),'10:00')]);
  check(rows.rowCount===1,'Only one active booking exists for contested slot');
  const overlaps=(await q.query(`SELECT count(*)::int AS n FROM bookings a JOIN bookings b ON a.barber_id=b.barber_id AND a.id<b.id
   WHERE a.barber_id=ANY($1::int[]) AND a.status IN ('pending','confirmed') AND b.status IN ('pending','confirmed')
     AND a.booking_time<b.booking_time+b.duration_minutes*interval '1 minute' AND b.booking_time<a.booking_time+a.duration_minutes*interval '1 minute'`,[h.ids.barbers])).rows[0].n;
  check(overlaps===0,'No active overlapping intervals in database');
 });
 await scenario('parallel status changes permit one transition and preserve resulting status',async()=>{
  const id=await created(date(10));const results=await h.parallel('confirm vs reject',barber.profileId,[()=>update(id,'confirmed'),()=>update(id,'rejected')]);
  check(results.map(r=>r.status).sort().join(',')==='200,400','Only one incompatible pending transition wins');
  check(['confirmed','rejected'].includes((await stored(id)).status),'Final status equals one valid winning transition');
 });
 await scenario('Telegram confirm/reject use actual update handler and same database status as website',async()=>{
  let id=await created(date(11));let events=await h.callback(id,'confirmed',chat);
  check((await stored(id)).status==='confirmed'&&events.some(e=>e.method==='answerCallbackQuery'&&e.alert===false),'Telegram confirm updates shared booking state');
  check(events.some(e=>e.buttonsRemoved),'Successful callback removes inline buttons');
  check((await h.call('GET',`/api/bookings/${id}`,undefined,customer)).body.status==='confirmed','Website read observes Telegram confirmation');
  id=await created(date(11),'11:00');events=await h.callback(id,'rejected',chat);
  check((await stored(id)).status==='rejected'&&events.some(e=>e.method==='answerCallbackQuery'&&e.alert===false),'Telegram rejection uses rejected status');
  check(has(await available(date(11)),'11:00'),'Telegram rejection releases website slot');
 });
 await scenario('old, foreign-owner and spoofed Telegram callbacks cannot change booking',async()=>{
  let otherChat;do{otherChat=900000000000+require('node:crypto').randomInt(1000000000);}while((await q.query('SELECT 1 FROM barber_telegram_links WHERE chat_id=$1',[otherChat])).rowCount);
  await h.insert('barber_telegram_links',['barber_id','chat_id','linked_at'],[otherBarber.profileId,otherChat,new Date()]);
  const id=await created(date(12));let events=await h.callback(id,'confirmed',otherChat);
  check((await stored(id)).status==='pending'&&events.some(e=>e.method==='answerCallbackQuery'&&e.alert),'Linked other barber cannot control foreign booking');
  events=await h.callback(id,'confirmed',chat,{from:{id:otherChat,is_bot:false}});
  check((await stored(id)).status==='pending'&&events.some(e=>e.method==='answerCallbackQuery'&&e.alert),'Spoofed callback user/chat mismatch rejected');
  check((await update(id,'confirmed')).status===200,'Website confirms pending booking');
  events=await h.callback(id,'rejected',chat);check((await stored(id)).status==='confirmed'&&events.some(e=>e.method==='answerCallbackQuery'&&e.alert),'Stale Telegram action cannot reverse website status');
 });
 await scenario('parallel duplicate Telegram callbacks make one successful transition',async()=>{
  const id=await created(date(13)),before=h.report.telegram.length;
  await h.parallel('duplicate Telegram confirm',barber.profileId,[()=>h.callback(id,'confirmed',chat),()=>h.callback(id,'confirmed',chat)]);
  const answers=h.report.telegram.slice(before).filter(e=>e.method==='answerCallbackQuery');
  check((await stored(id)).status==='confirmed'&&answers.length===2&&answers.filter(e=>!e.alert).length===1,'Exactly one callback succeeds; repeated callback reports already reviewed');
 });
 await scenario('Telegram transport failure is logged and cannot roll back committed booking',async()=>{
  const before=h.report.logs.length;h.setSendFailure(true);let id;
  try{id=await created(date(14));}finally{h.setSendFailure(false);}
  check((await stored(id)).status==='pending','Booking persists after notification failure');
  check(h.report.logs.slice(before).some(e=>e.kind==='telegram_delivery_failure'),'Notification failure is logged without secrets');
 });
 console.log('Booking evidence: '+h.root);
});
