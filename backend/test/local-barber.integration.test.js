const {test}=require('node:test');
const crypto=require('node:crypto');
const {createLocalBarberHarness}=require('./helpers/localBarber');
const enabled=process.env.USTARA_LOCAL_BARBER_WRITE_TESTS==='I_AUTHORIZE_TEST_DATA';
test('local ustara_test_db Barber API, service/schedule/linking integration',{skip:!enabled},async(t)=>{
 let h;try{h=await createLocalBarberHarness();}catch{throw new Error('Barber harness setup failed; raw credential-bearing error suppressed');}
 t.after(async()=>{try{await h.close();}catch{throw new Error('Exact-ID barber cleanup or preservation verification failed; see private report');}});
 const {check,control:q}=h;
 const barber=await h.person('barber'),other=await h.person('barber'),pending=await h.person('barber',false),customer=await h.person('customer');
 const row=async(table,id)=>(await q.query(`SELECT * FROM ${table} WHERE id=$1`,[id])).rows[0];
 const tokenRow=async b=>(await q.query('SELECT * FROM barber_telegram_link_tokens WHERE barber_id=$1',[b.profileId])).rows[0];
 const linkRow=async b=>(await q.query('SELECT * FROM barber_telegram_links WHERE barber_id=$1',[b.profileId])).rows[0];
 const initialPhone=(await row('users',barber.userId)).phone;
 const profile=(body,actor=barber,id=actor.profileId)=>h.call('PUT',`/api/barbers/${id}`,body,actor);
 const serviceBody={name:'LocalBarberTest',price:100000,duration_minutes:30};
 const addService=(extra={},actor=barber)=>h.call('POST','/api/services',{...serviceBody,...extra},actor);
 const editService=(id,extra={},actor=barber)=>h.call('PUT',`/api/services/${id}`,{...serviceBody,...extra},actor);
 const removeService=(id,actor=barber)=>h.call('DELETE',`/api/services/${id}`,undefined,actor);
 const hours=[{day_of_week:1,start_time:'09:00',end_time:'18:00'},{day_of_week:3,start_time:'10:00',end_time:'16:00'}];
 const setHours=(working_hours,actor=barber,extra={})=>h.call('PUT','/api/barbers/working-hours',{working_hours,...extra},actor);
 const getHours=(actor=barber,extra='')=>h.call('GET','/api/barbers/working-hours'+extra,undefined,actor);
 const startLink=(actor=barber,body={})=>h.call('POST','/api/barbers/telegram/start',body,actor);
 const linkStatus=(actor=barber,query='')=>h.call('GET','/api/barbers/telegram/status'+query,undefined,actor);
 const unlink=(actor=barber)=>h.call('DELETE','/api/barbers/telegram',undefined,actor);
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 const service=await h.insert('services',['barber_id','name','price','duration_minutes'],[barber.profileId,'Snapshot'+h.report.run,100000,30]);
 const foreignService=await h.insert('services',['barber_id','name','price','duration_minutes'],[other.profileId,'Foreign'+h.report.run,120000,45]);
 async function scenario(name,work,required=false){await t.test(name,()=>h.scenario(name,work));
  // Independent failures remain FAIL; dependent setup failures stop safely.
  if(required)check(h.report.cases.at(-1)?.status==='PASS','Required fixture/API stage failed; stop dependent cases');}

 await scenario('own profile and public approved profile use canonical user/profile identity',async()=>{
  const own=await h.call('GET','/api/barbers/me',undefined,barber);
  check(own.status===200&&own.body.barber.id===barber.profileId&&own.body.barber.phone===initialPhone,'Own profile matches real canonical account');
  const publicProfile=await h.call('GET',`/api/barbers/${barber.profileId}`,undefined,customer);
  check(publicProfile.status===200&&publicProfile.body.id===barber.profileId,'Approved public profile is intentionally readable by customers');
  check((await h.call('GET',`/api/barbers/${pending.profileId}`)).status===404,'Public pending profile is hidden');
  check((await h.call('GET','/api/barbers/me',undefined,pending)).status===200,'Pending barber can view own onboarding profile');
 });
 await scenario('profile updates accept both name formats and preserve phone/specialty/ownership',async()=>{
  check((await profile({first_name:'Updated',last_name:'Barber',phone:initialPhone})).status===200,'Snake-case profile names accepted');
  check((await profile({firstName:'Camel',lastName:'Names',user_id:other.userId,specialty:'cosmetolog',verification_status:'rejected'})).status===200,'Camel-case names accepted');
  const stored=await row('barbers',barber.profileId);
  check(stored.first_name==='Camel'&&stored.last_name==='Names'&&stored.user_id===barber.userId&&stored.specialty==='barber'&&stored.verification_status==='approved','Only supported name fields change');
  check((await row('users',barber.userId)).phone===initialPhone,'Canonical phone unchanged');
 });
 await scenario('profile required/invalid names and direct phone changes are rejected atomically',async()=>{
  const before=JSON.stringify(await row('barbers',barber.profileId));
  for(const payload of [{},{first_name:'Only'},{first_name:'',last_name:'Name'},{first_name:123,last_name:'Name'},
   {first_name:'<script>',last_name:'Name'},{first_name:'A'.repeat(81),last_name:'Name'}])check((await profile(payload)).status===400,'Invalid name input returns 400');
  check((await profile({first_name:'Name',last_name:'Changed',phone:'+998000000000'})).status===403,'Phone cannot change without OTP');
  check(JSON.stringify(await row('barbers',barber.profileId))===before,'Failed validation does not partially mutate profile');
 });
 await scenario('profile role/JWT/ownership guards reject foreign writes and mismatched claims',async()=>{
  const before=JSON.stringify(await row('barbers',other.profileId));
  check((await profile({first_name:'Wrong',last_name:'Owner'},barber,other.profileId)).status===403,'Another barber profile cannot be changed');
  check((await h.call('GET','/api/barbers/me',undefined,customer)).status===403,'Customer cannot read protected barber self endpoint');
  check((await profile({first_name:'Wrong',last_name:'Role'},customer,barber.profileId)).status===403,'Customer cannot write barber profile');
  check((await h.call('GET','/api/barbers/me')).status===401,'Missing JWT rejected');
  check((await h.call('GET','/api/barbers/me',undefined,{token:'invalid'})).status===401,'Invalid JWT rejected');
  check((await h.call('GET','/api/barbers/me',undefined,h.mismatched(barber,other.profileId))).status===401,'Signed JWT with foreign profile identity rejected by DB middleware');
  check(JSON.stringify(await row('barbers',other.profileId))===before,'Foreign profile unchanged');
 });
 await scenario('service create/list/read/update/delete execute real CRUD with owner-derived barber ID',async()=>{
  const created=await addService({barber_id:other.profileId});check(created.status===201,'Service creation returns 201');const id=created.body.data.id;
  check((await row('services',id)).barber_id===barber.profileId,'Service owner derived from JWT, not submitted barber_id');
  const list=await h.call('GET',`/api/services?barber_id=${barber.profileId}`,undefined,barber);
  check(list.status===200&&list.body.some(s=>s.id===id),'Own service list contains created row');
  const read=await h.call('GET',`/api/services/${id}`,undefined,customer);check(read.status===200&&read.body.id===id,'Authenticated customer may read service');
  const updated=await editService(id,{name:'ChangedService',price:125000,duration_minutes:45});
  check(updated.status===200&&(await row('services',id)).duration_minutes===45&&Number((await row('services',id)).price)===125000,'Service update persisted');
  check((await removeService(id)).status===200&&!await row('services',id),'Unbooked service deleted');
  check((await removeService(id)).status===404,'Repeated service delete returns 404');
 },true);
 await scenario('service required fields and invalid price/duration/type are client errors',async()=>{
  for(const body of [{},{...serviceBody,name:''},{...serviceBody,price:0},{...serviceBody,price:-1},
   {...serviceBody,price:'1000'},{...serviceBody,duration_minutes:0},{...serviceBody,duration_minutes:-1},
   {...serviceBody,duration_minutes:1.5},{...serviceBody,duration_minutes:'30'}]){
   check((await h.call('POST','/api/services',body,barber)).status===400,'Invalid service POST input returns 400');
  }
  for(const patch of [{name:''},{price:0},{duration_minutes:0}])check((await editService(service,patch)).status===400,'Invalid service PUT returns 400');
 });
 await scenario('service ownership/role and approval guard prevent foreign or customer writes',async()=>{
  const before=JSON.stringify(await row('services',foreignService));
  check((await editService(foreignService)).status===404&&(await removeService(foreignService)).status===404,'Foreign service cannot be edited/deleted');
  for(const call of [()=>addService({},customer),()=>editService(service,{},customer),()=>removeService(service,customer)])check((await call()).status===403,'Customer cannot write services');
  check((await addService({},pending)).status===403,'Pending barber cannot create service');
  const list=await h.call('GET',`/api/services?barber_id=${other.profileId}`,undefined,customer);check(list.status===200&&list.body.some(s=>s.id===foreignService),'Customer can view service list allowed by route');
  check((await h.call('GET','/api/services',undefined,barber)).status===400,'Service list requires barber_id');
  check(JSON.stringify(await row('services',foreignService))===before,'Foreign service unchanged');
 });
 for(const [label,patch] of [['name beyond VARCHAR(50)',{name:'A'.repeat(51)}],['price beyond NUMERIC(10,2)',{price:100000000}],['duration beyond INTEGER',{duration_minutes:2147483648}]]){
  await scenario('service schema-boundary validation: '+label,async()=>{
   const before=(await q.query('SELECT count(*)::int AS n FROM services WHERE barber_id=$1',[barber.profileId])).rows[0].n;
   const response=await addService(patch);
   check((await q.query('SELECT count(*)::int AS n FROM services WHERE barber_id=$1',[barber.profileId])).rows[0].n===before,'Oversized invalid service did not persist');
   check(response.status>=400&&response.status<500,'Invalid '+label+' must return client error; actual HTTP '+response.status);
  });
 }
 await scenario('weekly schedule replacement/read supports day off by omitting a weekday',async()=>{
  check((await setHours(hours)).status===200,'Valid weekly schedule saved');
  const own=await getHours();check(own.status===200&&own.body.length===2&&own.body[0].day_of_week===1&&own.body[1].day_of_week===3,'Own schedule read in weekday order');
  check((await setHours([hours[0]])).status===200,'Omitting Wednesday sets it as day off');
  check((await getHours()).body.length===1,'Schedule replacement removes omitted day');
  check((await setHours(hours)).status===200,'Weekly schedule restored for booking fixture');
 },true);
 await scenario('schedule malformed times, duplicate days and empty week reject without partial replacement',async()=>{
  const before=JSON.stringify((await getHours()).body);
  const bad=[null,[],[{day_of_week:7,start_time:'09:00',end_time:'18:00'}],[hours[0],hours[0]],
   [{day_of_week:1,start_time:'18:00',end_time:'09:00'}],[{day_of_week:1,start_time:'09:00',end_time:'09:00'}]];
  for(const value of ['9:00','09:00:00','24:00','12:60',123])bad.push([{day_of_week:1,start_time:value,end_time:'18:00'}]);
  for(const working_hours of bad)check((await setHours(working_hours)).status===400,'Invalid schedule rejected with 400');
  check(JSON.stringify((await getHours()).body)===before,'Rejected weekly replacements preserve previous full schedule');
 });
 await scenario('schedule identity comes only from JWT; cross-profile claims and customer writes rejected',async()=>{
  check((await setHours([{day_of_week:4,start_time:'11:00',end_time:'17:00'}],other)).status===200,'Other barber owns independent schedule');
  const otherBefore=JSON.stringify((await getHours(other)).body);
  check((await setHours(hours,barber,{barber_id:other.profileId})).status===200,'Foreign body barber_id cannot redirect self schedule write');
  const read=await getHours(barber,`?barber_id=${other.profileId}`);check(read.status===200&&read.body[0].day_of_week===1,'Foreign query barber_id cannot redirect own schedule read');
  check((await setHours(hours,customer)).status===403&&(await getHours(customer)).status===403,'Customer cannot access private schedule API');
  check((await setHours(hours,pending)).status===403,'Unapproved barber schedule write rejected');
  check((await getHours(h.mismatched(barber,other.profileId))).status===401,'Foreign profile claim rejected');
  check(JSON.stringify((await getHours(other)).body)===otherBefore,'Other barber schedule unchanged');
 });
 await scenario('service edit/delete preserves existing booking duration snapshot and FK integrity',async()=>{
  const today=(await q.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'Asia/Tashkent','YYYY-MM-DD') AS d")).rows[0].d;
  const dow=new Date(today+'T00:00:00Z').getUTCDay(),date=new Date(Date.parse(today+'T00:00:00Z')+((1-dow+7)%7+7)*86400000).toISOString().slice(0,10);
  const created=await h.call('POST','/api/bookings',{barber_id:barber.profileId,service_id:service,booking_time:date+'T10:00:00+05:00'},customer);
  check(created.status===201,'Dependent booking fixture created through HTTP');const id=created.body.data.id;
  check((await editService(service,{duration_minutes:15})).status===200,'Booked service duration can change for future bookings');
  check((await row('bookings',id)).duration_minutes===30,'Existing booking duration snapshot remains 30 minutes');
  check((await removeService(service)).status===409,'FK prevents deleting service referenced by booking');
  check((await row('services',service))&&(await row('bookings',id)).service_id===service,'Service and referenced booking remain intact');
  const available=await h.call('GET',`/api/bookings/available-slots?barber_id=${barber.profileId}&service_id=${service}&date=${date}`,undefined,customer);
  check(available.status===200&&available.body.duration===15&&available.body.busy.some(b=>b.start==='10:00'&&b.end==='10:30'),'Booking availability respects old snapshot with new service duration');
 });
 await scenario('parallel profile updates serialize and save a coherent complete name pair',async()=>{
  const a={first_name:'FirstAlpha',last_name:'LastAlpha'},b={first_name:'FirstBeta',last_name:'LastBeta'};
  const results=await h.parallelRows('profile updates','barbers',barber.profileId,[()=>profile(a),()=>profile(b)]);
  check(results.every(r=>r.status===200),'Both allowed full profile updates succeed');const final=await row('barbers',barber.profileId);
  check((final.first_name===a.first_name&&final.last_name===a.last_name)||(final.first_name===b.first_name&&final.last_name===b.last_name),'Final names are one coherent submitted pair, not mixed');
 });
 await scenario('parallel service updates are coherent and update/delete race preserves integrity',async()=>{
  const made=await addService();check(made.status===201,'Parallel service fixture created');const id=made.body.data.id;
  let results=await h.parallelRows('service updates','services',id,[()=>editService(id,{name:'Alpha',price:1000,duration_minutes:20}),()=>editService(id,{name:'Beta',price:2000,duration_minutes:40})]);
  check(results.every(r=>r.status===200),'Concurrent full service updates both allowed');const final=await row('services',id);
  check((final.name==='Alpha'&&Number(final.price)===1000&&final.duration_minutes===20)||(final.name==='Beta'&&Number(final.price)===2000&&final.duration_minutes===40),'Final service matches one full payload');
  results=await h.parallelRows('service update vs delete','services',id,[()=>editService(id),()=>removeService(id)]);
  check([200,404].includes(results[0].status)&&results[1].status===200&&!await row('services',id),'Delete wins final state; prior update may succeed or return 404 per row-lock order');
 });
 await scenario('Telegram start stores a hashed five-minute token, status hides private chat/token state',async()=>{
  const start=await startLink();check(start.status===200&&/^[0-9a-f]{64}$/.test(start.body.token),'Link API returns a random 32-byte token');
  const stored=await tokenRow(barber);check(stored.token_hash===hash(start.body.token)&&stored.token_hash!==start.body.token,'Only token hash stored in PostgreSQL');
  check(+stored.expires_at-+stored.created_at===300000,'Link token TTL exactly five minutes');
  check(new URL(start.body.botUrl).search===''&&!start.body.botUrl.includes(start.body.token),'Bot URL never includes token');
  const status=await linkStatus();check(status.status===200&&status.body.linked===false&&status.body.linkedAt===null&&!('token' in status.body)&&!('chat_id' in status.body),'Unlinked status exposes no capability or private chat ID');
 });
 await scenario('link token rotation/expiry/invalid/replay are enforced by real bot update handler',async()=>{
  const first=await startLink(),second=await startLink();check(first.status===200&&second.status===200&&first.body.token!==second.body.token,'Pre-link restart rotates capability');
  const chat=await h.freshChat();let outcome=await h.link(first.body.token,chat);
  check(outcome[0]?.code==='invalid_link'&&!await linkRow(barber),'Rotated token rejected');
  outcome=await h.link('invalid',chat);check(outcome[0]?.code==='invalid_link','Malformed token rejected');
  h.owned('barbers',barber.profileId);await q.query("UPDATE barber_telegram_link_tokens SET created_at=created_at-interval '6 minutes',expires_at=expires_at-interval '6 minutes' WHERE barber_id=$1",[barber.profileId]);
  outcome=await h.link(second.body.token,chat);check(outcome[0]?.code==='invalid_link'&&!await linkRow(barber),'Expired token rejected with no link');
  const fresh=await startLink();outcome=await h.link(fresh.body.token,chat);
  check(outcome[0]?.result==='linked'&&String((await linkRow(barber)).chat_id)===String(chat)&&!await tokenRow(barber),'Valid token consumed once and correct barber chat linked');
  outcome=await h.link(fresh.body.token,chat);check(outcome[0]?.code==='invalid_link','Consumed token replay rejected');
  check((await startLink()).status===409,'Already linked barber must unlink before relinking');
  const status=await linkStatus();check(status.status===200&&status.body.linked===true&&status.body.linkedAt,'Linked status returns timestamp');
 },true);
 await scenario('Telegram endpoint ownership and role guards prevent foreign state access',async()=>{
  const before=JSON.stringify(await linkRow(barber));
  const otherStatus=await linkStatus(other,`?barber_id=${barber.profileId}`);
  check(otherStatus.status===200&&otherStatus.body.linked===false,'Status query cannot redirect other actor to linked barber');
  for(const [method,route,body] of [['POST','/api/barbers/telegram/start',{}],['GET','/api/barbers/telegram/status',undefined],['DELETE','/api/barbers/telegram',undefined]]){
   check((await h.call(method,route,body,customer)).status===403,'Customer forbidden from barber linking endpoint');
   check((await h.call(method,route,body,h.mismatched(other,barber.profileId))).status===401,'Foreign JWT profile claim rejected before linking operation');
  }
  check(JSON.stringify(await linkRow(barber))===before,'Foreign linking attempts leave original link unchanged');
 });
 await scenario('unlink cancels link/pending token and permits safe relink; chat uniqueness rollback is atomic',async()=>{
  check((await unlink()).status===200&&!await linkRow(barber)&&!await tokenRow(barber),'Unlink removes both link and pending capability');
  check((await unlink()).status===200,'Unlink is idempotent under current contract');
  const otherStart=await startLink(other),occupied=await h.freshChat();check(otherStart.status===200,'Other barber starts link');
  check((await h.link(otherStart.body.token,occupied))[0]?.result==='linked','Other barber linked to own test chat');
  const mine=await startLink();check(mine.status===200,'Previously unlinked barber can restart');
  const outcome=await h.link(mine.body.token,occupied);check(outcome[0]?.code==='23505','Unique Telegram chat cannot belong to another barber');
  check(!await linkRow(barber)&&(await tokenRow(barber)).token_hash===hash(mine.body.token),'Failed unique-chat insert rolls back and leaves valid token available');
  const ownChat=await h.freshChat();check((await h.link(mine.body.token,ownChat))[0]?.result==='linked','Same token can succeed after transaction rollback with another free chat');
 });
 await scenario('parallel consumption of one linking token commits exactly one association',async()=>{
  check((await unlink()).status===200,'Parallel fixture unlinked');const start=await startLink(),a=await h.freshChat(),b=await h.freshChat();check(start.status===200,'Parallel token fixture created');
  const before=h.report.linkOutcomes.length;
  await h.parallelRows('same link token consume','barbers',barber.profileId,[()=>h.link(start.body.token,a),()=>h.link(start.body.token,b)]);
  const outcomes=h.report.linkOutcomes.slice(before),linked=await linkRow(barber);
  check(outcomes.length===2&&outcomes.filter(o=>o.result==='linked').length===1&&outcomes.filter(o=>o.code==='invalid_link').length===1,'Only one concurrent token consumer succeeds');
  check([String(a),String(b)].includes(String(linked.chat_id))&&!await tokenRow(barber),'Exactly one chat linked and token consumed');
 });
 await scenario('unlink revokes an outstanding unconsumed token',async()=>{
  check((await unlink()).status===200,'Unlink existing parallel result');const start=await startLink();check(start.status===200,'New unconsumed token created');
  check((await unlink()).status===200&&!await tokenRow(barber),'Unlink clears outstanding token even without an active chat');
  check((await h.link(start.body.token,await h.freshChat()))[0]?.code==='invalid_link','Revoked capability cannot link');
 });
 console.log('Barber evidence: '+h.root);
});
