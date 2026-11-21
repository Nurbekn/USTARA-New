const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { createOtpPostgresHarness } = require('./helpers/otpPostgres');
test('public profil: haqiqiy API, PostgreSQL va rasm upload', {skip:process.env.USTARA_DISPOSABLE_OTP_TESTS!=='I_AUTHORIZE_TEMP_DATABASE',timeout:90000},async t=>{
 const h=await createOtpPostgresHarness();t.after(()=>h.close());console.log('Public profil artefaktlari:',h.root);
 await h.admin.query('CREATE EXTENSION btree_gist WITH SCHEMA public');
 for(const name of ['20261115_slots_02_booking_no_overlap','20261116_account_profile_deletion_integrity','20261117_barber_profile','20261117_barber_profile_02_booking_acceptance','20261118_social_portfolio_reviews'])await h.admin.query(fs.readFileSync(path.join(__dirname,'../database/migrations',name+'.sql'),'utf8'));
 const express=require('express'),app=express();app.use(require('cors')());app.use(express.json());const auth=require('../middleware/authMiddleware'),social=require('../controllers/socialController');
 app.post('/api/media',express.raw({type:'application/octet-stream',limit:'2mb'}),auth,social.mediaUpload);app.get('/api/media/:id',social.mediaRead);
 for(const route of ['barbers','services','bookings','social'])app.use('/api/'+route,require('../routes/'+route));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 async function person(role,phone){await h.admin.query('BEGIN');const u=(await h.admin.query('INSERT INTO users(phone,password,role) VALUES($1,$2,$3) RETURNING id,created_at',[phone,'unused-test',role])).rows[0];const p=(await h.admin.query(`INSERT INTO ${role==='barber'?'barbers':'customers'}(user_id,first_name,last_name,created_at${role==='barber'?',specialty':''}) VALUES($1,'Ali','Valiyev',$2${role==='barber'?",'barber'":''}) RETURNING id`,[u.id,u.created_at])).rows[0];await h.admin.query('COMMIT');const actor={id:u.id,profileId:p.id,role,sessionVersion:0,phone};return{...actor,token:jwt.sign(actor,process.env.JWT_SECRET,{expiresIn:'1h'})};}
 const barber=await person('barber','+998900006001'),customer=await person('customer','+998900006002');
 const call=async(url,method='GET',body,token=customer.token)=>{const r=await fetch(base+url,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,body:await r.json()};};
 const hoursUrl='/api/barbers/'+barber.profileId+'/working-hours';
 await t.test('tasdiqlanmagan profilning jadvali ochilmaydi',async()=>{assert.equal((await call(hoursUrl)).status,404);});
 await h.admin.query("UPDATE barbers SET verification_status='approved',address=$2,latitude=41.3,longitude=69.2 WHERE id=$1",[barber.profileId,'Toshkent, Mirzo Ulug‘bek tumani, '+ 'uzun-manzil-'.repeat(15)]);
 await t.test('bo‘sh jadval muvaffaqiyatli empty natija beradi',async()=>{const r=await call(hoursUrl);assert.equal(r.status,200);assert.deepEqual(r.body,[]);});
 await h.admin.query("INSERT INTO barber_working_hours(barber_id,day_of_week,start_time,end_time) SELECT $1,day,'09:00','18:00' FROM generate_series(1,6) day",[barber.profileId]);
 await t.test('mijoz haqiqiy olti kunlik ish jadvalini oladi',async()=>{const r=await call(hoursUrl);assert.equal(r.body.length,6);assert.equal(r.body[0].start_time,'09:00:00');});
 const service=(await call('/api/services','POST',{name:'Soch olish',price:50000,duration_minutes:30},barber.token)).body.data;
 const bytes=fs.readFileSync(path.join(__dirname,'../../frontend/public/images/fade-640.webp'));let media,post;
 await t.test('rasm haqiqiy HTTP orqali yuklanadi va postdan keyin o‘qiladi',async()=>{
  const response=await fetch(base+'/api/media',{method:'POST',headers:{authorization:'Bearer '+barber.token,'content-type':'application/octet-stream'},body:bytes});assert.equal(response.status,201);media=await response.json();
  const created=await call('/api/social/posts','POST',{caption:'Yangi uslub',kind:'standard',serviceId:service.id,mediaIds:[media.id]},barber.token);assert.equal(created.status,201);post=created.body.post;
  const image=await fetch(base+'/api/media/'+media.id);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/webp');assert.deepEqual(Buffer.from(await image.arrayBuffer()),bytes);
 });
 await t.test('public profil, portfolio va xizmatlar bir xil sartaroshga tegishli',async()=>{
  assert.equal((await call('/api/barbers/'+barber.profileId)).body.id,barber.profileId);
  const portfolio=await call('/api/barbers/'+barber.profileId+'/portfolio');assert.equal(portfolio.body.posts[0].id,post.id);assert.equal(portfolio.body.posts[0].media[0].url,'/api/media/'+media.id);
  assert.equal((await call('/api/services?barber_id='+barber.profileId)).body[0].id,service.id);
 });
 if(process.env.USTARA_PUBLIC_PROFILE_E2E==='1')await t.test('320px va 390px profil: jadval, tablar, rasm va placeholder',async()=>{await require('./helpers/publicBarberProfileMobile').runPublicProfileMobile({base,barber,customer,artifacts:h.root});});
});
