const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { createOtpPostgresHarness } = require('./helpers/otpPostgres');
test('Ko‘p xizmatli bron va Social: haqiqiy PostgreSQL', { skip: process.env.USTARA_DISPOSABLE_OTP_TESTS !== 'I_AUTHORIZE_TEMP_DATABASE', timeout: 180000 }, async t => {
 const h = await createOtpPostgresHarness(); t.after(() => h.close()); console.log('Artefaktlar:', h.root);
 await h.admin.query('CREATE EXTENSION btree_gist WITH SCHEMA public');
 for (const name of ['20261115_slots_02_booking_no_overlap','20261116_account_profile_deletion_integrity','20261117_barber_profile','20261117_barber_profile_02_booking_acceptance','20261118_social_portfolio_reviews']) await h.admin.query(fs.readFileSync(path.join(__dirname, '../database/migrations', name + '.sql'), 'utf8'));
 const notifications = require('../services/telegramBookingNotifications');
 const realNotifier = notifications.createBookingNotifier, sent = [];
 notifications.createBookingNotifier = options => realNotifier({ ...options, api: async (method, body) => { sent.push({ method, body }); }, logger: { error() {} } });
 t.after(() => { notifications.createBookingNotifier = realNotifier; });
 const express = require('express'), app = express(); app.use(require('cors')()); app.use(express.json());
 const auth = require('../middleware/authMiddleware'), social = require('../controllers/socialController');
 app.post('/api/media', express.raw({ type:'application/octet-stream', limit:'2mb' }), auth, social.mediaUpload); app.get('/api/media/:id', social.mediaRead);
 for (const route of ['barbers','customers','services','bookings','social']) app.use('/api/' + route, require('../routes/' + route));
 // Reklama sohasi o‘zgartirilmaydi; test katalogida faol reklama yo‘q.
 app.get('/api/promotions', (_req, res) => res.json([]));
 const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
 const base = 'http://127.0.0.1:' + server.address().port;
 async function person(role, suffix) {
  const phone = '+998900007' + String(suffix).padStart(3,'0');
  await h.admin.query('BEGIN');
  const u = (await h.admin.query('INSERT INTO users(phone,password,role) VALUES($1,$2,$3) RETURNING id,created_at', [phone,'unused-test-password',role])).rows[0];
  const p = (await h.admin.query(`INSERT INTO ${role === 'barber' ? 'barbers' : 'customers'}(user_id,first_name,last_name,created_at${role === 'barber' ? ',specialty' : ''}) VALUES($1,'Ali','Valiyev',$2${role === 'barber' ? ",'barber'" : ''}) RETURNING id`, [u.id,u.created_at])).rows[0];
  await h.admin.query('COMMIT');
  const actor = { id:u.id, profileId:p.id, role, phone, sessionVersion:0 };
  return { ...actor, token:jwt.sign(actor, process.env.JWT_SECRET, { expiresIn:'1h' }) };
 }
 const barber = await person('barber',1), customer = await person('customer',2), other = await person('customer',3), second = await person('barber',4);
 const extras = [await person('barber',5), await person('barber',6)];
 const barberIds = [barber,second,...extras].map(p => p.profileId);
 await h.admin.query("UPDATE barbers SET verification_status='approved',address='Toshkent',latitude=41.3,longitude=69.2 WHERE id=ANY($1::int[])", [barberIds]);
 await h.admin.query("INSERT INTO barber_working_hours(barber_id,day_of_week,start_time,end_time) SELECT $1,day,'09:00','18:00' FROM generate_series(0,6) day", [barber.profileId]);
 const call = async (url, method='GET', body, token=customer.token) => { const r = await fetch(base + url, { method, headers:{authorization:'Bearer '+token,'content-type':'application/json'}, ...(body === undefined ? {} : { body:JSON.stringify(body) }) }); return { status:r.status, body:await r.json() }; };
 const services=[];
 for (const [name,price,duration_minutes] of [['Soch olish',50000,20],['Soqol olish',25000,10]]) { const r=await call('/api/services','POST',{name,price,duration_minutes},barber.token); assert.equal(r.status,201); services.push(r.body.data); }
 const foreign = (await call('/api/services','POST',{name:'Boshqa xizmat',price:10000,duration_minutes:5},second.token)).body.data;
 const date = new Date(Date.now()+86400000).toISOString().slice(0,10);
 const selection = time => ({ barber_id:barber.profileId, service_ids:services.map(s=>s.id), booking_time:`${date}T${time}:00+05:00`, duration_minutes:5, total_price:1 });
 await t.test('migrationdan oldin bitta xizmat ishlaydi, ko‘p xizmat aniq rad etiladi', async () => {
  assert.equal((await call('/api/bookings','POST',{...selection('16:00'),service_ids:[services[0].id]})).status,201);
  assert.equal((await call('/api/bookings','POST',selection('17:00'))).status,503);
 });
 const migration = fs.readFileSync(path.join(__dirname,'../database/migrations/20261125_multi_service_bookings.sql'),'utf8');
 await t.test('migration eski bronlarni saqlaydi va takroriy qo‘llash atomik rad etiladi', async () => {
  const before=(await h.admin.query('SELECT * FROM bookings ORDER BY id')).rows;
  await h.admin.query(migration);
  const after=(await h.admin.query('SELECT * FROM bookings ORDER BY id')).rows;
  assert.deepEqual(after.map(({total_price,...row})=>{assert.equal(total_price,null);return row;}),before);
  await assert.rejects(h.admin.query(migration)); await h.admin.query('ROLLBACK');
  assert.equal((await h.admin.query("SELECT count(*)::int AS n FROM ustara_schema_migrations WHERE version='20261125_multi_service_bookings'")).rows[0].n,1);
 });
 let booking;
 await t.test('jami narx va davomiylik serverda hisoblanib snapshot saqlanadi', async () => {
  const r=await call('/api/bookings','POST',selection('09:05')); assert.equal(r.status,201); booking=r.body.data;
  assert.equal(booking.duration_minutes,30);assert.equal(booking.total_price,'75000.00');assert.equal(booking.services.length,2);
  assert.equal((await h.admin.query('SELECT count(*)::int n FROM booking_services WHERE booking_id=$1',[booking.id])).rows[0].n,2);
 });
 await t.test('5 daqiqalik qadam, qisman kesishish va to‘liq ish vaqti tekshiriladi', async () => {
  const r=await call(`/api/bookings/available-slots?barber_id=${barber.profileId}&service_ids=${services.map(s=>s.id).join(',')}&date=${date}`);
  assert.equal(r.status,200);assert.equal(r.body.duration,30);assert.equal(r.body.total_price,'75000.00');
  const available=time=>r.body.candidates.find(s=>s.start===time)?.available;
  // Public guests learn only free slots, not the timing of existing bookings.
  assert.equal(available('09:00'),undefined);assert.equal(available('09:30'),undefined);assert.equal(available('09:35'),true);
  assert.equal(Object.hasOwn(r.body,'busy'),false);
  assert.ok(r.body.candidates.every(s=>s.available===true));
  assert.ok(r.body.candidates.every(s=>Number(s.start.slice(3))%5===0));
  assert.equal((await call('/api/bookings','POST',selection('09:30'))).status,409);
  assert.equal((await call('/api/bookings','POST',selection('17:35'))).status,400);
  assert.equal((await call('/api/bookings','POST',selection('10:02'))).status,400);
 });
 await t.test('boshqa sartarosh, takroriy va faol bo‘lmagan xizmatlar qabul qilinmaydi', async () => {
  for (const ids of [[foreign.id],[services[0].id,services[0].id],[]]) assert.equal((await call('/api/bookings','POST',{...selection('11:00'),service_ids:ids})).status,400);
  assert.equal((await call('/api/bookings','POST',selection('11:00'),barber.token)).status,403);
  const s=services[1]; assert.equal((await call('/api/services/'+s.id,'PUT',{name:s.name,price:Number(s.price),duration_minutes:s.duration_minutes,is_active:false},barber.token)).status,200);
  assert.equal((await call('/api/bookings','POST',selection('11:00'))).status,400);
  assert.equal((await call('/api/services?barber_id='+barber.profileId)).body.length,1);
  assert.equal((await call('/api/services?barber_id='+barber.profileId,'GET',undefined,barber.token)).body.length,2);
  assert.equal((await call('/api/bookings','POST',{barber_id:barber.profileId,service_id:s.id,booking_time:selection('11:00').booking_time})).status,404);
  assert.equal((await call('/api/services/'+s.id,'PUT',{name:s.name,price:Number(s.price),duration_minutes:s.duration_minutes,is_active:true},barber.token)).status,200);
 });
 await t.test('ikki haqiqiy parallel ulanishdan faqat bittasi slotni oladi', async () => {
  await h.admin.query('BEGIN');await h.admin.query('SELECT pg_advisory_xact_lock($1)',[barber.profileId]);
  const batch=Promise.all([call('/api/bookings','POST',selection('11:00')),call('/api/bookings','POST',selection('11:00'),other.token)]);batch.catch(()=>{});
  let waiting=[];
  try { for(let i=0;i<100;i++){waiting=(await h.observer.query("SELECT pid FROM pg_stat_activity WHERE application_name='ustara_otp_service_worker' AND wait_event_type='Lock'")).rows;if(waiting.length>=2)break;await new Promise(r=>setTimeout(r,30));} }
  finally { await h.admin.query('ROLLBACK'); }
  const result=await batch;assert.ok(waiting.length>=2);assert.deepEqual(result.map(r=>r.status).sort(),[201,409]);
  fs.writeFileSync(path.join(h.root,'booking-race.json'),JSON.stringify({pids:waiting.map(r=>r.pid),statuses:result.map(r=>r.status)}));
 });
 await t.test('PostgreSQL exclusion cheklovi controllerdan tashqarida ham to‘qnashuvni bloklaydi', async () => {
  await assert.rejects(h.admin.query('INSERT INTO bookings(customer_id,barber_id,service_id,booking_time,duration_minutes) VALUES($1,$2,$3,$4,30)',[other.profileId,barber.profileId,services[0].id,selection('09:10').booking_time]),{code:'23P01'});
 });
 await t.test('narx tahriri oldingi bron snapshotini o‘zgartirmaydi, list va detail barcha xizmatlarni beradi', async () => {
  await h.admin.query('UPDATE services SET price=60000 WHERE id=$1',[services[0].id]);
  const r=await call('/api/bookings/'+booking.id);assert.equal(r.body.services.length,2);assert.equal(r.body.total_price,'75000.00');assert.equal(r.body.services[0].price,'50000.00');
  const own=await call('/api/bookings','GET',undefined,barber.token);assert.equal(own.body.find(row=>row.id===booking.id).services.length,2);
 });
 await t.test('Telegram xabarida barcha xizmatlar, jami narx, boshlanish va tugash bor', async () => {
  await h.admin.query('INSERT INTO barber_telegram_links(barber_id,chat_id,linked_at) VALUES($1,$2,clock_timestamp())',[barber.profileId,'777000']);
  const r=await realNotifier({pool:h.pool,api:async(method,body)=>sent.push({method,body}),logger:{error(){}}})(booking.id);
  assert.equal(r.sent,true);const text=sent.at(-1).body.text;for(const part of ['Soch olish','Soqol olish','75','000','09:05','09:35','30'])assert.ok(text.includes(part));
 });
 const bytes=fs.readFileSync(path.join(__dirname,'../../frontend/public/images/fade-640.webp')); let post;
 await t.test('upload, saqlangan byte va public media serving bir xil', async () => {
  const media=[];for(let i=0;i<2;i++){const r=await fetch(base+'/api/media',{method:'POST',headers:{authorization:'Bearer '+barber.token,'content-type':'application/octet-stream'},body:bytes});assert.equal(r.status,201);media.push(await r.json());}
  const r=await call('/api/social/posts','POST',{caption:'Yangi uslub',kind:'standard',serviceId:services[0].id,mediaIds:media.map(m=>m.id)},barber.token);assert.equal(r.status,201);post=r.body.post;
  for(const m of post.media){const image=await fetch(base+m.url);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/webp');assert.deepEqual(Buffer.from(await image.arrayBuffer()),bytes);}
  assert.equal((await fetch(base+'/api/media/99999999')).status,404);
 });
 await t.test('like/save/follow idempotent, qayta o‘qish va bekor qilish saqlanadi', async () => {
  for(const [action,key] of [['like','liked'],['save','saved']]){
   for(let i=0;i<2;i++)assert.equal((await call(`/api/social/posts/${post.id}/${action}`,'PUT',{[key]:true})).body[key],true);
   const read=(await call('/api/social/posts/'+post.id)).body.post;assert.equal(read[action==='like'?'likedByMe':'saved'],true);if(action==='like')assert.equal(read.likeCount,1);
   assert.equal((await call(`/api/social/posts/${post.id}/${action}`,'PUT',{[key]:false})).body[key],false);
  }
  const url='/api/social/barbers/'+barber.profileId+'/follow';for(let i=0;i<2;i++)assert.equal((await call(url,'PUT',{following:true})).body.following,true);
  assert.ok((await call('/api/social')).body.following.includes('barber:'+barber.profileId));assert.equal((await call(url,'PUT',{following:false})).body.following,false);
 });
 await t.test('izoh qo‘shish, egasini tekshirish, tahrirlash va o‘chirish', async () => {
  const url=`/api/social/posts/${post.id}/comments`,r=await call(url,'POST',{text:'Zo‘r uslub'});assert.equal(r.status,201);assert.equal(r.body.mine,true);const target=url+'/'+r.body.id;
  assert.equal((await call(target,'PUT',{text:'Boshqa'},other.token)).status,404);assert.equal((await call(target,'DELETE',undefined,other.token)).status,404);
  assert.equal((await call(target,'PUT',{text:'Yangilangan izoh'})).body.text,'Yangilangan izoh');assert.equal((await call(url)).body[0].mine,true);assert.equal((await call(url,'GET',undefined,other.token)).body[0].mine,false);
  assert.equal((await call(target,'DELETE')).body.commentCount,0);assert.deepEqual((await call(url)).body,[]);
 });
 await t.test('daromad ko‘p xizmatli bron snapshotini va eski narx asosini saqlaydi', async () => {
  const yesterday=new Date(Date.parse(date+'T12:00:00Z')-2*86400000).toISOString().slice(0,10);
  await h.admin.query('BEGIN');
  const past=(await h.admin.query("INSERT INTO bookings(customer_id,barber_id,service_id,booking_time,duration_minutes,total_price,status) VALUES($1,$2,$3,$4,30,75000,'completed') RETURNING id",[customer.profileId,barber.profileId,services[0].id,yesterday+'T10:00:00+05:00'])).rows[0];
  await h.admin.query('INSERT INTO booking_services SELECT $1,position,service_id,service_name,price,duration_minutes FROM booking_services WHERE booking_id=$2',[past.id,booking.id]);
  await h.admin.query('COMMIT');
  let r=await call('/api/barbers/earnings','GET',undefined,barber.token);assert.equal(r.status,200);assert.equal(r.body.basis,'booking_snapshot');assert.equal(r.body.rows.reduce((sum,row)=>sum+row.amount,0),75000);assert.ok(r.body.rows[0].service.includes('Soqol olish'));
  await h.admin.query("INSERT INTO bookings(customer_id,barber_id,service_id,booking_time,duration_minutes,status) VALUES($1,$2,$3,$4,20,'completed')",[customer.profileId,barber.profileId,services[0].id,yesterday+'T12:00:00+05:00']);
  r=await call('/api/barbers/earnings','GET',undefined,barber.token);assert.equal(r.body.basis,'mixed_snapshot_and_current_price');assert.equal(r.body.rows.reduce((sum,row)=>sum+row.amount,0),135000);
 });
 if(process.env.USTARA_SOCIAL_BOOKING_E2E==='1') await t.test('mobil va desktop Chrome: Social, ko‘p xizmatli bron, Home va dashboard',async()=>{
  await require('./helpers/socialBookingBrowser').runSocialBookingBrowser({base,barber,customer,services,date,artifacts:h.root,setFewBarbers:()=>h.admin.query("UPDATE barbers SET verification_status='pending' WHERE id=ANY($1::int[])",[extras.map(p=>p.profileId)])});
 });
 await t.test('butun bron bekor qilinadi va barcha xizmatlarning vaqti bo‘shaydi', async () => {
  const r=await call('/api/bookings/'+booking.id,'PUT',{status:'cancelled'});assert.equal(r.status,200);assert.equal(r.body.data.services.length,2);
  const slots=await call(`/api/bookings/available-slots?barber_id=${barber.profileId}&service_ids=${services.map(s=>s.id).join(',')}&date=${date}`);assert.ok(slots.body.slots.some(s=>s.start==='09:05'));
  assert.equal((await call('/api/bookings','POST',selection('09:05'))).status,201);
 });
});
