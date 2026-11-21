'use strict';
// Opt-in ONLY. No migration, DROP or live credentials are executed/read here.
// Run only on an explicitly approved local ustara_test_db which has all v14
// forward migrations applied. Creates and removes its own test account rows.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {Pool}=require('pg');
const {testTarget,assertTestConnection}=require('./helpers/testDatabaseTarget');
const {modifyCustomerBooking,modificationSlots}=require('../services/bookingModification');
const {createMultiBooking}=require('../services/multiBooking');
const {recoverBooking}=require('../services/bookingRecovery');
const {fingerprint}=require('../services/bookingIdempotency');
const {fitsBooking,dayHours,invalidActiveBooking}=require('../services/calendarSchedule');
const enabled=process.env.NODE_ENV==='test'
  && process.env.USTARA_BOOKING_CONCURRENCY_TESTS==='I_AUTHORIZE_TEST_DATA'
  && Boolean(process.env.USTARA_TEST_DATABASE_URL);
const TEST_ROLE='ustara_account_test';
const TIME='2035-01-01'; // fixed future date; no time mocking in SQL
const iso=time=>`${TIME}T${time}:00+05:00`;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('v14: independent PostgreSQL connections enforce customer + barber overlap and atomic modifications',
  {skip:!enabled,timeout:120000},async t=>{
  const target=testTarget(process.env.USTARA_TEST_DATABASE_URL,'USTARA booking concurrency',[TEST_ROLE]);
  const pool=new Pool({connectionString:process.env.USTARA_TEST_DATABASE_URL,
    ssl:false,application_name:'ustara_booking_concurrency_test',max:6,
    connectionTimeoutMillis:5000,options:'-c search_path=public -c timezone=UTC',
    statement_timeout:15000});
  const users=[],services=[],bookings=[],workHours=[];
  t.after(async()=>{
    try {
      if(users.length){
        const c=await pool.connect();
        try{
          await assertTestConnection(c,target,TEST_ROLE);
          await c.query('BEGIN');
          const customerIds=users.filter(p=>p.role==='customer').map(p=>p.profileId);
          const barberIds=users.filter(p=>p.role==='barber').map(p=>p.profileId);
          // These IDs belong only to profiles created by this test.
          await c.query('DELETE FROM bookings WHERE customer_id=ANY($1::int[]) OR barber_id=ANY($2::int[])',[customerIds,barberIds]);
          // The test owns these barber profiles. Never mutate other users' break rows.
          await c.query('DELETE FROM barber_weekly_breaks WHERE barber_id=ANY($1::int[])',[barberIds]);
          await c.query('DELETE FROM barber_date_breaks WHERE barber_id=ANY($1::int[])',[barberIds]);
          await c.query('DELETE FROM services WHERE id=ANY($1::int[])',[services.map(s=>s.id)]);
          await c.query('DELETE FROM barber_working_hours WHERE id=ANY($1::int[])',[workHours]);
          for(const user of users) await c.query('DELETE FROM users WHERE id=$1 AND phone=$2',[user.userId,user.phone]);
          await c.query('COMMIT');
        }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
        finally{c.release();}
      }
    }finally{await pool.end();}
  });
  const guard=await pool.connect();
  try{
    await assertTestConnection(guard,target,TEST_ROLE);
    const catalog=await guard.query(`SELECT
      EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261130_customer_time_overlap') AS migrated,
      EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
        WHERE c.conrelid='public.bookings'::regclass
          AND c.conname='bookings_customer_time_excl' AND c.contype='x' AND c.convalidated) AS protected,
      to_regclass('public.booking_services') IS NOT NULL AS snapshots,
      EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261203_barber_break_rules') AS recurring_breaks,
      to_regprocedure('ustara_effective_breaks(integer,date)') IS NOT NULL AS effective_break_function`);
    assert.deepEqual(catalog.rows[0],{migrated:true,protected:true,snapshots:true,recurring_breaks:true,effective_break_function:true},
      'Apply/review all v19 migrations in the explicitly approved TEST database first');
  }finally{guard.release();}
  async function person(role){
    const phone='+998'+String(crypto.randomInt(100000000,999999999));
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      const u=(await c.query('INSERT INTO users(phone,password,role) VALUES($1,$2,$3) RETURNING id',
        [phone,'v14-disposable-fixture-only',role])).rows[0];
      const p=role==='barber'
        ?(await c.query("INSERT INTO barbers(user_id,first_name,last_name,specialty,verification_status) VALUES($1,'Test','Barber','barber','approved') RETURNING id",[u.id])).rows[0]
        :(await c.query("INSERT INTO customers(user_id,first_name,last_name) VALUES($1,'Test','Customer') RETURNING id",[u.id])).rows[0];
      await c.query('COMMIT');
      const data={userId:u.id,profileId:p.id,phone,role};users.push(data);return data;
    }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
    finally{c.release();}
  }
  const [c1,c2,b1,b2]=[await person('customer'),await person('customer'),await person('barber'),await person('barber')];
  async function service(barber,name,price){
    const s=(await pool.query('INSERT INTO services(barber_id,name,price,duration_minutes) VALUES($1,$2,$3,30) RETURNING id,price',
      [barber.profileId,name,price])).rows[0]; services.push(s);return s;
  }
  const s1=await service(b1,'Fixture haircut',50000),s2=await service(b2,'Fixture trim',25000);
  const day=new Date(`${TIME}T00:00:00Z`).getUTCDay();
  for(const barber of [b1,b2]){
    const h=(await pool.query("INSERT INTO barber_working_hours(barber_id,day_of_week,start_time,end_time) VALUES($1,$2,'08:00','20:00') RETURNING id",[barber.profileId,day])).rows[0];
    workHours.push(h.id);
  }
  async function insert(customer,barber,svc,time,status='confirmed',connection=pool){
    const row=(await connection.query(`INSERT INTO bookings(customer_id,barber_id,service_id,booking_time,duration_minutes,status,total_price)
      VALUES($1,$2,$3,$4,30,$5,$6) RETURNING id,booking_time,status`,
      [customer.profileId,barber.profileId,svc.id,iso(time),status,svc.price])).rows[0];
    bookings.push(row.id);return row;
  }
  async function rejectedInSavepoint(fn,constraint){
    const c=await pool.connect();
    try{
      await c.query('BEGIN');await c.query('SAVEPOINT attempt');
      await assert.rejects(fn(c),(e)=>e.code==='23P01' && e.constraint===constraint);
      await c.query('ROLLBACK TO SAVEPOINT attempt');await c.query('COMMIT');
    }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
    finally{c.release();}
  }
  const base=await insert(c1,b1,s1,'10:00');
  await t.test('same customer at another barber overlaps; adjacent slot remains valid',async()=>{
    await rejectedInSavepoint(c=>insert(c1,b2,s2,'10:10'),'bookings_customer_time_excl');
    const adjacent=await insert(c1,b2,s2,'10:30');
    await rejectedInSavepoint(c=>c.query('UPDATE bookings SET booking_time=$2 WHERE id=$1',[adjacent.id,iso('10:20')]),
      'bookings_customer_time_excl');
    assert.equal(new Date((await pool.query('SELECT booking_time FROM bookings WHERE id=$1',[adjacent.id])).rows[0].booking_time).getTime(),Date.parse(iso('10:30')));
  });
  await t.test('cancelled overlap allowed; changing cancelled back to confirmed is blocked',async()=>{
    const cancelled=await insert(c1,b2,s2,'10:00','cancelled');
    await rejectedInSavepoint(c=>c.query("UPDATE bookings SET status='confirmed' WHERE id=$1",[cancelled.id]),
      'bookings_customer_time_excl');
    assert.equal((await pool.query('SELECT status FROM bookings WHERE id=$1',[cancelled.id])).rows[0].status,'cancelled');
  });
  await t.test('two independent uncommitted inserts race across DIFFERENT barbers',async()=>{
    const left=await pool.connect(),right=await pool.connect();
    let leftOpen=false,rightOpen=false;
    try{
      await left.query('BEGIN');leftOpen=true;
      await right.query('BEGIN');rightOpen=true;
      await insert(c2,b1,s1,'12:00','confirmed',left);
      const challenger=insert(c2,b2,s2,'12:05','confirmed',right);
      challenger.catch(()=>{}); // prevent an unhandled rejection while lock waits
      // Let PostgreSQL observe the conflicting uncommitted exclusion tuple.
      let sawLock=false;
      for(let i=0;i<40;i++){
        const active=(await left.query(`SELECT wait_event_type FROM pg_catalog.pg_stat_activity
          WHERE pid=$1`,[right.processID])).rows[0];
        if(active?.wait_event_type==='Lock'){sawLock=true;break;}
        await wait(25);
      }
      await left.query('COMMIT');leftOpen=false;
      await assert.rejects(challenger,e=>e.code==='23P01'&&e.constraint==='bookings_customer_time_excl');
      await right.query('ROLLBACK');rightOpen=false;
      assert.ok(sawLock,'Two connections must overlap while waiting on the exclusion constraint');
      const rows=(await pool.query(`SELECT COUNT(*)::int AS n FROM bookings WHERE customer_id=$1 AND status='confirmed'
        AND booking_time>= $2::timestamptz AND booking_time< $3::timestamptz`,
        [c2.profileId,iso('12:00'),iso('12:35')])).rows[0];
      assert.equal(rows.n,1);
    }finally{
      if(leftOpen)await left.query('ROLLBACK').catch(()=>{});
      if(rightOpen)await right.query('ROLLBACK').catch(()=>{});
      left.release();right.release();
    }
  });
  await t.test('atomic service modification: stale quote and collision do not destroy original booking',async()=>{
    await pool.query(`INSERT INTO booking_services(booking_id,position,service_id,service_name,price,duration_minutes)
      VALUES($1,0,$2,'Fixture haircut',50000,30)`,[base.id,s1.id]);
    const actor={role:'customer',profileId:c1.profileId,accountId:c1.userId};
    const edited=await modifyCustomerBooking(pool,actor,base.id,{
      booking_time:iso('11:00'),expected_booking_time:iso('10:00'),
      service_ids:[s1.id],expected_service_ids:[s1.id],expected_total_price:'50000.00',
    });
    assert.equal(new Date(edited.booking_time).getTime(),Date.parse(iso('11:00')));
    await assert.rejects(modifyCustomerBooking(pool,actor,base.id,{
      booking_time:iso('10:35'),expected_booking_time:iso('11:00'),
    }),e=>e.status===409&&e.code==='customer_time_conflict');
    await pool.query('UPDATE services SET price=60000 WHERE id=$1',[s1.id]);
    await assert.rejects(modifyCustomerBooking(pool,actor,base.id,{
      booking_time:iso('11:30'),expected_booking_time:iso('11:00'),
      service_ids:[s1.id],expected_service_ids:[s1.id],expected_total_price:'50000.00',
    }),e=>e.status===409&&e.code==='price_changed');
    const stored=(await pool.query('SELECT booking_time,total_price FROM bookings WHERE id=$1',[base.id])).rows[0];
    assert.equal(new Date(stored.booking_time).getTime(),Date.parse(iso('11:00')));
    assert.equal(String(stored.total_price),'50000.00');
  });

  await t.test('v104: quote is read-only and cannot cross account/profile boundaries',async()=>{
    // Two real profiles on the same explicitly authorized TEST database.
    // The authenticated accountId must match the customer profile used to
    // fetch the booking. A quote must never change the booking row.
    const before=(await pool.query('SELECT booking_time,total_price,status FROM bookings WHERE id=$1',[base.id])).rows[0];
    await assert.rejects(modificationSlots(pool,
      {role:'customer',profileId:c1.profileId,accountId:c2.userId},base.id,TIME),
      e=>e.status===401 && e.code==='invalid_session');
    await assert.rejects(modificationSlots(pool,
      {role:'customer',profileId:c2.profileId,accountId:c2.userId},base.id,TIME),
      e=>e.status===404 && e.code==='not_found');
    const authorized=await modificationSlots(pool,
      {role:'customer',profileId:c1.profileId,accountId:c1.userId},base.id,TIME);
    assert.equal(authorized.date,TIME);
    assert.deepEqual(Object.keys(authorized).sort(),
      ['accepting_bookings','date','duration','slots','working']);
    const after=(await pool.query('SELECT booking_time,total_price,status FROM bookings WHERE id=$1',[base.id])).rows[0];
    assert.equal(Date.parse(after.booking_time),Date.parse(before.booking_time));
    assert.equal(String(after.total_price),String(before.total_price));
    assert.equal(after.status,before.status);
  });

  await t.test('v78: quoted booking snapshots survive price, duration and archival changes',async()=>{
    // Opt-in PostgreSQL test only. All rows are uniquely owned by this fixture;
    // the existing t.after cleanup removes them by customer/barber profile.
    const svc=await service(b2,'v78 archived fixture',45000);
    const actor={role:'customer',profileId:c2.profileId,accountId:c2.userId};
    const request=(time,price='45000.00',duration=30)=>({
      barber_id:b2.profileId,service_ids:[svc.id],booking_time:iso(time),
      expected_total_price:price,expected_duration_minutes:duration,
    });
    const created=await createMultiBooking(pool,actor,request('16:00'));
    assert.equal(String(created.total_price),'45000.00');
    let original=await pool.query(`SELECT b.total_price,b.duration_minutes,bs.service_name,bs.price,bs.duration_minutes AS snapshot_duration
      FROM bookings b JOIN booking_services bs ON bs.booking_id=b.id WHERE b.id=$1`,[created.id]);
    assert.equal(original.rowCount,1);
    assert.equal(original.rows[0].service_name,'v78 archived fixture');
    assert.equal(String(original.rows[0].price),'45000.00');
    await pool.query('UPDATE services SET name=$2,price=$3,duration_minutes=$4 WHERE id=$1',
      [svc.id,'v78 renamed service',55000,45]);
    await assert.rejects(createMultiBooking(pool,actor,request('17:00')),
      e=>e.status===409 && e.code==='price_changed');
    await assert.rejects(createMultiBooking(pool,actor,request('17:00','55000.00',30)),
      e=>e.status===409 && e.code==='duration_changed');
    const rejected=await pool.query('SELECT count(*)::int AS n FROM bookings WHERE customer_id=$1 AND booking_time=$2',
      [c2.profileId,iso('17:00')]);
    assert.equal(rejected.rows[0].n,0,'stale quotes must not create new bookings');
    await pool.query('UPDATE services SET is_active=false WHERE id=$1',[svc.id]);
    await assert.rejects(createMultiBooking(pool,actor,request('17:00','55000.00',45)),
      e=>e.status===400 && e.code==='service_unavailable');
    await pool.query('UPDATE services SET is_active=true WHERE id=$1',[svc.id]);
    const next=await createMultiBooking(pool,actor,request('17:00','55000.00',45));
    assert.equal(String(next.total_price),'55000.00');
    original=await pool.query(`SELECT b.total_price,b.duration_minutes,bs.service_name,bs.price,bs.duration_minutes AS snapshot_duration
      FROM bookings b JOIN booking_services bs ON bs.booking_id=b.id WHERE b.id=$1`,[created.id]);
    assert.equal(original.rows[0].service_name,'v78 archived fixture');
    assert.equal(String(original.rows[0].price),'45000.00');
    assert.equal(Number(original.rows[0].snapshot_duration),30);
    assert.equal(String(original.rows[0].total_price),'45000.00');
    assert.equal(Number(original.rows[0].duration_minutes),30);
  });

  await t.test('v78: separate connections serialize an archive UPDATE behind locked service selection',async()=>{
    const svc=await service(b2,'v78 lock fixture',35000);
    const left=await pool.connect(),right=await pool.connect();
    let leftOpen=false,rightOpen=false;
    try{
      await left.query('BEGIN');leftOpen=true;
      await left.query('SELECT pg_advisory_xact_lock($1)',[b2.profileId]);
      await left.query(`SELECT id,price FROM services WHERE id=$1 FOR SHARE`,[svc.id]);
      await right.query('BEGIN');rightOpen=true;
      const changing=right.query('UPDATE services SET is_active=false WHERE id=$1 RETURNING id',[svc.id]);
      changing.catch(()=>{});
      let lockObserved=false;
      for(let i=0;i<80;i++){
        const r=await left.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[right.processID]);
        if(r.rows[0]?.wait_event_type==='Lock'){lockObserved=true;break;}
        await wait(25);
      }
      assert.equal(lockObserved,true,'archive UPDATE must wait for locked selection');
      await left.query('COMMIT');leftOpen=false;
      const changed=await changing;
      assert.equal(changed.rowCount,1);
      await right.query('COMMIT');rightOpen=false;
      const active=await pool.query('SELECT is_active FROM services WHERE id=$1',[svc.id]);
      assert.equal(active.rows[0].is_active,false);
    } finally {
      if(leftOpen) await left.query('ROLLBACK').catch(()=>{});
      if(rightOpen) await right.query('ROLLBACK').catch(()=>{});
      left.release();right.release();
    }
  });

  await t.test('v79: two API booking requests cannot commit the same barber slot',async()=>{
    // Different customers, one verified barber and one slot. Advisory barber
    // locking must serialize the requests; the exclusion constraint is backup.
    const actor=user=>({role:'customer',profileId:user.profileId,accountId:user.userId});
    const input={barber_id:b2.profileId,service_ids:[s2.id],booking_time:iso('18:00'),
      expected_total_price:'25000.00',expected_duration_minutes:30};
    const results=await Promise.allSettled([
      createMultiBooking(pool,actor(c1),input),
      createMultiBooking(pool,actor(c2),input),
    ]);
    const wins=results.filter(r=>r.status==='fulfilled');
    const loses=results.filter(r=>r.status==='rejected');
    assert.equal(wins.length,1,'only one transaction may commit');
    assert.equal(loses.length,1);
    assert.equal(loses[0].reason.status,409);
    assert.equal(loses[0].reason.code,'booking_conflict');
    const rows=await pool.query(`SELECT id,total_price FROM bookings WHERE barber_id=$1
      AND booking_time=$2 AND status='confirmed'`,[b2.profileId,iso('18:00')]);
    assert.equal(rows.rowCount,1);
    assert.equal(String(rows.rows[0].total_price),'25000.00');
  });

  await t.test('v79: price change committed while booking awaits row lock rejects stale quote',async()=>{
    const svc=await service(b2,'v79 concurrent quote fixture',47000);
    const actor={role:'customer',profileId:c1.profileId,accountId:c1.userId};
    const transaction=await pool.connect();
    let active=false,booking;
    try {
      await transaction.query('BEGIN');active=true;
      await transaction.query('UPDATE services SET price=49000,duration_minutes=45 WHERE id=$1',[svc.id]);
      let bookingClient;
      const capturePool={connect:async()=>{
        bookingClient=await pool.connect();return bookingClient;
      }};
      booking=createMultiBooking(capturePool,actor,{
        barber_id:b2.profileId,service_ids:[svc.id],booking_time:iso('19:00'),
        expected_total_price:'47000.00',expected_duration_minutes:30,
      });
      booking.catch(()=>{}); // avoid unhandled rejection during lock observation
      let sawLock=false;
      for(let i=0;i<80;i++) {
        if(bookingClient?.processID) {
          const row=await transaction.query('SELECT wait_event_type FROM pg_catalog.pg_stat_activity WHERE pid=$1',
            [bookingClient.processID]);
          if(row.rows[0]?.wait_event_type==='Lock') {sawLock=true;break;}
        }
        await wait(25);
      }
      await transaction.query('COMMIT');active=false;
      await assert.rejects(booking,e=>e.status===409&&e.code==='price_changed');
      assert.equal(sawLock,true,'booking must actually wait for the service row lock');
      const rows=await pool.query('SELECT id FROM bookings WHERE customer_id=$1 AND booking_time=$2',
        [actor.profileId,iso('19:00')]);
      assert.equal(rows.rowCount,0,'stale price must not create a booking');
    } finally {
      if(active) await transaction.query('ROLLBACK').catch(()=>{});
      transaction.release();
      if(booking) await booking.catch(()=>{});
    }
  });

  await t.test('v81: lost response can be recovered by customer without creating a second booking',async()=>{
    const migrated=await pool.query("SELECT to_regclass('public.booking_request_keys') IS NOT NULL AS ready");
    assert.equal(migrated.rows[0].ready,true,'Apply the reviewed idempotency migration to this TEST DB first');
    const requestId=crypto.randomUUID();
    const actor={role:'customer',profileId:c2.profileId,accountId:c2.userId};
    const body={barber_id:b1.profileId,service_ids:[s1.id],booking_time:iso('19:00'),
      expected_total_price:'50000.00',expected_duration_minutes:30,request_id:requestId};
    const created=await createMultiBooking(pool,actor,body);
    assert.equal(created.replayed,undefined);
    const recovered=await recoverBooking(pool,actor,requestId);
    assert.equal(recovered.found,true);
    assert.equal(recovered.data.id,created.id);
    assert.equal(recovered.data.services[0].name,'Fixture haircut');
    const replay=await createMultiBooking(pool,actor,body);
    assert.equal(replay.replayed,true);
    assert.equal(replay.id,created.id);
    const other=await recoverBooking(pool,{role:'customer',profileId:c1.profileId,accountId:c1.userId},requestId);
    assert.deepEqual(other,{found:false,uncertain:true},'request ID must be scoped to its customer');
    const unknown=await recoverBooking(pool,actor,crypto.randomUUID());
    assert.deepEqual(unknown,{found:false,uncertain:true},'no result never proves the POST rolled back');
    const count=await pool.query('SELECT COUNT(*)::int AS n FROM bookings WHERE id=$1',[created.id]);
    assert.equal(count.rows[0].n,1,'read-only recovery and retry must not create duplicates');
  });

  await t.test('v82: recovery before an uncommitted POST stays uncertain; later commit replays once',async()=>{
    const actor={role:'customer',profileId:c2.profileId,accountId:c2.userId};
    const requestId=crypto.randomUUID(), start=iso('19:30');
    const writer=await pool.connect();
    let opened=false;
    try {
      await writer.query('BEGIN');opened=true;
      const row=await insert(c2,b1,s1,'19:30','confirmed',writer);
      await writer.query(`INSERT INTO booking_services(booking_id,position,service_id,service_name,price,duration_minutes)
        VALUES($1,0,$2,$3,$4,30)`,[row.id,s1.id,'Fixture haircut','50000.00']);
      await writer.query(`INSERT INTO booking_request_keys(customer_id,request_id,fingerprint,booking_id)
        VALUES($1,$2::uuid,$3,$4)`,[c2.profileId,requestId,fingerprint(b1.profileId,[s1.id],start),row.id]);
      const before=await recoverBooking(pool,actor,requestId);
      assert.deepEqual(before,{found:false,uncertain:true},'uncommitted request must not be treated as a definitive failure');
      await writer.query('COMMIT');opened=false;
      const after=await recoverBooking(pool,actor,requestId);
      assert.equal(after.found,true);
      assert.equal(after.data.id,row.id);
      assert.equal(after.data.services[0].name,'Fixture haircut');
      const retry=await createMultiBooking(pool,actor,{
        barber_id:b1.profileId,service_ids:[s1.id],booking_time:start,
        expected_total_price:'50000.00',expected_duration_minutes:30,request_id:requestId,
      });
      assert.equal(retry.replayed,true);
      assert.equal(retry.id,row.id);
      const count=await pool.query('SELECT COUNT(*)::int AS n FROM booking_request_keys WHERE customer_id=$1 AND request_id=$2::uuid',[c2.profileId,requestId]);
      assert.equal(count.rows[0].n,1);
    }finally {
      if(opened)await writer.query('ROLLBACK').catch(()=>{});
      writer.release();
    }
  });

  await t.test('v20: recurring breaks protect saved bookings, availability and concurrent modification',async()=>{
    // Controller's pool is injected; never import the app's real db.js or .env.
    const dbPath=require.resolve('../db');
    const former=require.cache[dbPath];
    require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
    let createHandlers;
    try{({createHandlers}=require('../controllers/breakRulesController'));}
    finally{if(former)require.cache[dbPath]=former;else delete require.cache[dbPath];}
    const handlers=createHandlers(pool);
    const day=new Date(`${TIME}T00:00:00Z`).getUTCDay();
    const request=(breaks)=>({user:{role:'barber',profileId:b1.profileId,id:b1.userId},body:{day_of_week:day,breaks}});
    const reply=()=>({statusCode:200,body:null,status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}});
    const update=async(breaks)=>{const res=reply();await handlers.weekly(request(breaks),res);return res;};

    // An existing booking must block a newly added lunch break; rollback
    // protects the previous rules, not just the booking row.
    const denied=await update([{start:'11:00',end:'11:30'}]);
    assert.equal(denied.statusCode,409);
    assert.equal(denied.body.code,'existing_booking_conflict');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM barber_weekly_breaks WHERE barber_id=$1',[b1.profileId])).rows[0].n,0);
    assert.equal(Date.parse((await pool.query('SELECT booking_time FROM bookings WHERE id=$1',[base.id])).rows[0].booking_time),Date.parse(iso('11:00')));

    // Dated rules must have the same rollback protection. No inherited
    // exception or existing booking is removed by a rejected date edit.
    const updateDated=async(breaks)=>{
      const res=reply();await handlers.dated({user:{role:'barber',profileId:b1.profileId,id:b1.userId},
        body:{date:TIME,breaks}},res);return res;
    };
    const deniedDate=await updateDated([{start:'11:00',end:'11:30'}]);
    assert.equal(deniedDate.statusCode,409);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM barber_date_breaks WHERE barber_id=$1',[b1.profileId])).rows[0].n,0);
    const safeDate=await updateDated([{start:'13:00',end:'13:30'}]);
    assert.equal(safeDate.statusCode,200);

    const lunch=await update([{start:'12:30',end:'13:00'}]);
    assert.equal(lunch.statusCode,200);
    assert.equal(lunch.body.saved,1);
    const connection=await pool.connect();
    try{
      assert.equal(await fitsBooking(connection,b1.profileId,iso('12:35'),30),false);
      assert.equal(await fitsBooking(connection,b1.profileId,iso('13:00'),30),true);
      const hours=await dayHours(connection,b1.profileId,TIME);
      assert.ok(hours.rows[0].breaks.some(b=>b.start==='12:30'&&b.end==='13:00'));
      assert.ok(hours.rows[0].breaks.some(b=>b.start==='13:00'&&b.end==='13:30'));
      assert.equal(await fitsBooking(connection,b1.profileId,iso('13:05'),30),false);
    }finally{connection.release();}

    // Two independent transactions race for the same advisory lock. Exactly
    // one change may win, and the resulting DB state must remain consistent.
    const actor={role:'customer',profileId:c1.profileId,accountId:c1.userId};
    const [breakResult,moveResult]=await Promise.allSettled([
      update([{start:'16:00',end:'16:30'}]),
      modifyCustomerBooking(pool,actor,base.id,{booking_time:iso('16:00'),expected_booking_time:iso('11:00')}),
    ]);
    assert.equal(breakResult.status,'fulfilled');
    const breakWon=breakResult.value.statusCode===200;
    const moveWon=moveResult.status==='fulfilled';
    assert.equal(Number(breakWon)+Number(moveWon),1,
      `Only one of concurrent weekly break / booking move may commit: ${JSON.stringify([breakResult,moveResult])}`);
    if(!breakWon)assert.equal(breakResult.value.body.code,'existing_booking_conflict');
    if(!moveWon)assert.equal(moveResult.reason.code,'outside_work_hours');
    const check=await pool.connect();
    try{
      assert.equal(await invalidActiveBooking(check,b1.profileId),null);
      const booking=(await check.query('SELECT booking_time FROM bookings WHERE id=$1',[base.id])).rows[0];
      assert.equal(Date.parse(booking.booking_time),Date.parse(iso(moveWon?'16:00':'11:00')));
      assert.equal(await fitsBooking(check,b1.profileId,iso('16:00'),30),!breakWon);
    }finally{check.release();}
  });

});
