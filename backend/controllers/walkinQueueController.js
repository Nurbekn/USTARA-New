'use strict';
const pool = require('../db');
const {isPgConnectionBroken}=require('../utils/pgConnectionHealth');
const {cancelUnconfirmedQueueOffers,cleanupTerminalQueue}=require('../services/queueOfferLifecycle');
const safeId = value => {
  const n = typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const error = (status, code, message) => Object.assign(new Error(message), {status, code});
const dateLabel = date => date instanceof Date
  ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)
  : String(date).slice(0,10);
const publicFields = row => ({id: row.id, display_label: row.display_label,
  queue_date: dateLabel(row.queue_date), status: row.status, queue_position: row.queue_position ?? null,
  ...(typeof row.is_qr==='boolean'?{is_qr:row.is_qr}:{}),
  ...(typeof row.manual_linked==='boolean'?{manual_linked:row.manual_linked}:{}),
  created_at: row.created_at,
  called_at: row.called_at, arrived_at: row.arrived_at??null, started_at: row.started_at??null, finished_at: row.finished_at});
const activeSql = `SELECT id,display_label,queue_date,status,queue_position,created_at,called_at,arrived_at,started_at,finished_at,
  EXISTS(SELECT 1 FROM walkin_qr_requests r WHERE r.queue_entry_id=walkin_queue.id AND r.status='approved') AS is_qr,
  EXISTS(SELECT 1 FROM walkin_manual_claims m WHERE m.entry_id=walkin_queue.id AND m.consent_at IS NOT NULL) AS manual_linked
  FROM walkin_queue WHERE barber_id=$1
    AND queue_date=(statement_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
    AND status IN ('waiting','called','arrived','in_service')
    ORDER BY queue_date DESC, CASE WHEN status IN ('called','arrived','in_service') THEN 0 ELSE 1 END, queue_position ASC NULLS LAST, id LIMIT 100`;
const recentSql = `SELECT id,display_label,queue_date,status,queue_position,created_at,called_at,arrived_at,started_at,finished_at
  FROM walkin_queue WHERE barber_id=$1 AND status IN ('served','missed','left') ORDER BY id DESC LIMIT 20`;
const queueSelect = `SELECT id,barber_id,request_key,display_label,queue_date,status,queue_position,created_at,called_at,arrived_at,started_at,finished_at FROM walkin_queue`;
function validateLabel(input) {
  if (input === undefined || input === null || input === '') return 'Mehmon';
  if (typeof input !== 'string') throw error(400,'invalid_label','Navbat nomi noto‘g‘ri.');
  const label = input.trim();
  if (!label || label.length > 60 || /[\x00-\x1f\x7f]/.test(label)) throw error(400,'invalid_label','Navbat nomi 1–60 belgi bo‘lishi kerak.');
  return label;
}
function requireBarber(req) {
  if (req.user?.role !== 'barber') throw error(403,'forbidden','Navbat faqat sartarosh uchun.');
  const barberId = safeId(req.user.profileId), userId = safeId(req.user.id);
  if (!barberId || !userId) throw error(401,'invalid_session','Sartarosh sessiyasi yaroqsiz.');
  return {barberId,userId};
}
function respondError(res, e) {
  res.set('Cache-Control','no-store');
  if (e.commitUncertain) return res.status(503).json({code:'queue_result_unknown',message:'Navbat amali natijasi noaniq. Yangilab tekshiring, avtomatik takrorlamang.'});
  if (e.status) return res.status(e.status).json({message:e.message,code:e.code});
  if (e.code === '55P03' || e.code === '57014' || e.code === '40P01')
    return res.status(409).json({code:'queue_busy',message:'Navbat hozir band. Qayta urinib ko‘ring.'});
  console.error('walk-in queue',e.code||'error');
  return res.status(503).json({code:'queue_unavailable',message:'Navbat vaqtincha ishlamayapti.'});
}
// Optional optimistic preconditions: modern queue clients submit the entry
// they actually saw. Older clients retain the existing server-side semantics.
function callPrecondition(body) {
  if (!body || !Object.prototype.hasOwnProperty.call(body,'expected_next_id'))
    return {provided:false,id:null};
  const id=safeId(body.expected_next_id);
  if(!id)throw error(400,'invalid_precondition','Chaqiriladigan navbat ID noto‘g‘ri.');
  return {provided:true,id};
}
function finishPrecondition(body) {
  if(!body || !Object.prototype.hasOwnProperty.call(body,'expected_status'))return null;
  if(!['waiting','called','arrived','in_service'].includes(body.expected_status))
    throw error(400,'invalid_precondition','Avvalgi navbat holati noto‘g‘ri.');
  return body.expected_status;
}
const dayCloseSnapshotSql = `WITH clock AS (
        SELECT statement_timestamp() AS as_of,
               (statement_timestamp() AT TIME ZONE 'Asia/Tashkent')::date AS today
      ) SELECT clock.today::text AS queue_date, clock.as_of,
        EXISTS(SELECT 1 FROM barber_day_closures dc WHERE dc.barber_id=$1 AND dc.local_date=clock.today AND dc.is_closed) AS closed,
        COALESCE((SELECT dc.revision FROM barber_day_closures dc WHERE dc.barber_id=$1 AND dc.local_date=clock.today),0)::int AS revision,
        (SELECT count(*)::int FROM walkin_queue q WHERE q.barber_id=$1
          AND q.queue_date=clock.today AND q.status='waiting') AS waiting,
        (SELECT count(*)::int FROM walkin_queue q WHERE q.barber_id=$1
          AND q.queue_date=clock.today AND q.status='called') AS called,
        (SELECT count(*)::int FROM walkin_queue q WHERE q.barber_id=$1
          AND q.queue_date=clock.today AND q.status='arrived') AS arrived,
        (SELECT count(*)::int FROM walkin_queue q WHERE q.barber_id=$1
          AND q.queue_date=clock.today AND q.status='in_service') AS in_service,
        (SELECT count(*)::int FROM walkin_qr_requests q WHERE q.barber_id=$1
          AND q.status='pending' AND q.created_at>clock.as_of-interval '30 minutes'
          AND (q.created_at AT TIME ZONE 'Asia/Tashkent')::date=clock.today) AS pending_qr,
        (SELECT count(*)::int FROM bookings b WHERE b.barber_id=$1
          AND (b.booking_time AT TIME ZONE 'Asia/Tashkent')::date=clock.today
          AND b.status IN ('pending','confirmed')) AS active_bookings,
        (SELECT count(*)::int FROM smart_booking_openings o WHERE o.barber_id=$1
          AND (o.start_at AT TIME ZONE 'Asia/Tashkent')::date=clock.today
          AND o.state IN ('open','offered','accepted')) AS active_offers,
        (SELECT count(*)::int FROM walkin_queue q WHERE q.barber_id=$1
          AND q.queue_date<clock.today
          AND q.status IN ('waiting','called','arrived','in_service')) AS past_unresolved
      FROM clock`;
const dayCloseFields = ['waiting','called','arrived','in_service','pending_qr','active_bookings','active_offers','past_unresolved'];
const isFullTimestamp = value => (value instanceof Date && Number.isFinite(value.getTime()))
  || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value)));
const isCalendarDay = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value+'T12:00:00Z'))
  && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
function assertFreshDayPreview(input,snapshot) {
  const reviewed=Date.parse(input.reviewed_at),clock=Date.parse(snapshot.as_of);
  if(!Number.isFinite(reviewed)||!Number.isFinite(clock)||clock-reviewed<0||clock-reviewed>30000)
    throw error(409,'day_preview_expired','30 soniya ichida yangidan tekshirib, tasdiqlang.');
}
function dayCloseSummary(row,result) {
  if(result.rowCount!==1 || !isCalendarDay(row?.queue_date)
    || !isFullTimestamp(row.as_of) || dateLabel(new Date(row.as_of))!==row.queue_date
    || typeof row.closed!=='boolean'
    || !Number.isSafeInteger(row.revision) || row.revision<0
    || dayCloseFields.some(k=>!Number.isSafeInteger(row[k])||row[k]<0))
    throw error(503,'queue_unavailable','Kun yakuni ma’lumotlarini tekshirib bo‘lmadi.');
  const blockers=dayCloseFields.filter(k=>row[k]>0);
  return {queue_date:row.queue_date,as_of:row.as_of,
    counts:Object.fromEntries(dayCloseFields.map(k=>[k,row[k]])),ready:!blockers.length,
    blockers,closed:row.closed,revision:row.revision,read_only:true};
}
function dayCloseInput(body,action) {
  if(!body || !isCalendarDay(body.expected_date)
    || !Number.isSafeInteger(body.expected_revision) || body.expected_revision<0
    || body.confirm!==action)throw error(400,'invalid_day_confirmation','Kun yakuni tasdig‘i noto‘g‘ri.');
  if(!isFullTimestamp(body.reviewed_at) || typeof body.reviewed_at!=='string')
    throw error(400,'invalid_day_confirmation','Yangi tekshiruv talab qilinadi.');
  return body;
}
function createHandlers(database=pool) {
  async function transaction(req,res,operation,{readOnly=false}={}) {
    let actor,client,inTx=false,broken=false,commitStarted=false;
    try {
      actor=requireBarber(req);
      client=await database.connect();
      await client.query('BEGIN');inTx=true;
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='15s'");
      // v46: bind the profile to the signed-in user and hold BOTH identity
      // share-locks through COMMIT. Acquire identity locks BEFORE the shared
      // barber mutex, matching account-deactivation and booking lock order.
      const verified=await client.query(`SELECT b.id FROM barbers b JOIN users u ON u.id=b.user_id
         WHERE b.id=$1 AND b.user_id=$2 AND b.verification_status='approved' AND u.role='barber'
          AND u.deactivated_at IS NULL FOR SHARE OF b,u`,[actor.barberId,actor.userId]);
      if (!verified.rowCount) throw error(403,'barber_unavailable','Faol tasdiqlangan sartarosh hisobi kerak.');
      // Barber-wide mutex is shared with booking/calendar/offer writes.
      await client.query('SELECT pg_advisory_xact_lock($1)',[actor.barberId]);
      const result=await operation(client,actor);
      commitStarted=true;await client.query('COMMIT');inTx=false;commitStarted=false;
      res.set('Cache-Control','no-store');return res.status(result.httpStatus||200).json(result.payload);
    } catch(e) {
      if(isPgConnectionBroken(e))broken=true;
      if(commitStarted){broken=true;if(!readOnly)e.commitUncertain=true;}
      else if (client&&inTx) try {await client.query('ROLLBACK');} catch {broken=true;}
      return respondError(res,e);
    } finally {if(client)client.release(broken);}
  }
  async function list(req,res) {
    let actor,client,inTx=false,broken=false,commitStarted=false;
    try {
      actor=requireBarber(req);
      client=await database.connect();
      // One snapshot for identity + queue rows. The identity share-lock also
      // serializes an account pause against the private GET until COMMIT.
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');inTx=true;
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='15s'");
      const verified=await client.query(`SELECT b.id FROM barbers b JOIN users u ON u.id=b.user_id
         WHERE b.id=$1 AND b.user_id=$2 AND b.verification_status='approved' AND u.role='barber'
          AND u.deactivated_at IS NULL FOR SHARE OF b,u`,[actor.barberId,actor.userId]);
      if(!verified.rowCount)throw error(403,'barber_unavailable','Faol tasdiqlangan sartarosh hisobi kerak.');
      const active=await client.query(activeSql,[actor.barberId]);
      const recent=await client.query(recentSql,[actor.barberId]);
      commitStarted=true;await client.query('COMMIT');inTx=false;commitStarted=false;
      res.set('Cache-Control','no-store');
      return res.json({active:active.rows.map(publicFields),recent:recent.rows.map(publicFields)});
    } catch(e){
      if(isPgConnectionBroken(e))broken=true;
      if(commitStarted){broken=true;}
      else if(client&&inTx)try{await client.query('ROLLBACK');}catch{broken=true;}
      return respondError(res,e);
    } finally {if(client)client.release(broken);}
  }
  // Safe close is serialized against all normal queue/QR/booking writes by
  // the barber advisory transaction lock, and uses PostgreSQL local date.
  async function dayClosePreview(req,res) {
    return transaction(req,res,async(client,{barberId})=>{
      const rows=await client.query(dayCloseSnapshotSql,[barberId]);
      return {payload:dayCloseSummary(rows.rows[0],rows)};
    },{readOnly:true});
  }
  async function closeDay(req,res) {
    let input;try{input=dayCloseInput(req.body,'CLOSE');}catch(e){return respondError(res,e);}
    return transaction(req,res,async(client,{barberId,userId})=>{
      const rows=await client.query(dayCloseSnapshotSql,[barberId]);
      const snap=dayCloseSummary(rows.rows[0],rows);
      if(input.expected_date!==snap.queue_date)
        throw error(409,'day_changed','Kun almashgan. Qayta tekshiring.');
      // Replayed responses may be safely inspected after a lost HTTP reply.
      if(snap.closed && snap.revision===input.expected_revision+1)
        return {payload:{...snap,replayed:true,read_only:false}};
      if(input.expected_revision!==snap.revision)
        throw error(409,'day_changed','Kun yakuni holati o‘zgargan. Yangilang.');
      if(snap.closed)return {payload:{...snap,replayed:true,read_only:false}};
      assertFreshDayPreview(input,snap);
      if(!snap.ready)throw error(409,'day_not_ready','Yakunlanmagan ishlar bor. Avval ularni tekshiring.');
      // Prevent a stale confirmation crossing midnight even if the transaction
      // waited on a lock, and limit repeat/reorder by optimistic revision.
      const changed=await client.query(`INSERT INTO barber_day_closures
        (barber_id,local_date,closed_by_user_id,revision)
        SELECT $1,$2::date,$3,1 WHERE $2::date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
        ON CONFLICT(barber_id,local_date) DO UPDATE SET is_closed=true,
          revision=barber_day_closures.revision+1,closed_at=clock_timestamp(),
          closed_by_user_id=$3,reopened_at=NULL,reopened_by_user_id=NULL
        WHERE NOT barber_day_closures.is_closed AND barber_day_closures.revision=$4
          AND $2::date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
        RETURNING revision`,[barberId,snap.queue_date,userId,snap.revision]);
      if(changed.rowCount!==1)throw error(409,'day_changed','Kun o‘zgargan. Yangilang.');
      await client.query(`INSERT INTO barber_day_close_events
        (barber_id,local_date,actor_user_id,action,revision) VALUES($1,$2::date,$3,'closed',$4)`,
        [barberId,snap.queue_date,userId,changed.rows[0].revision]);
      return {payload:{...snap,closed:true,revision:changed.rows[0].revision,
        read_only:false,replayed:false}};
    });
  }
  async function reopenDay(req,res) {
    let input;try{input=dayCloseInput(req.body,'REOPEN');}catch(e){return respondError(res,e);}
    return transaction(req,res,async(client,{barberId,userId})=>{
      const rows=await client.query(dayCloseSnapshotSql,[barberId]);
      const snap=dayCloseSummary(rows.rows[0],rows);
      if(input.expected_date!==snap.queue_date)
        throw error(409,'day_changed','Faqat bugungi kunni qayta ochish mumkin.');
      if(!snap.closed && snap.revision===input.expected_revision+1)
        return {payload:{...snap,read_only:false,replayed:true}};
      if(snap.revision!==input.expected_revision)
        throw error(409,'day_changed','Kun yakuni holati o‘zgargan. Yangilang.');
      if(!snap.closed)throw error(409,'day_not_closed','Bugungi kun yopilmagan.');
      assertFreshDayPreview(input,snap);
      const changed=await client.query(`UPDATE barber_day_closures
        SET is_closed=false,revision=revision+1,reopened_at=clock_timestamp(),reopened_by_user_id=$3
        WHERE barber_id=$1 AND local_date=$2::date AND revision=$4 AND is_closed
          AND $2::date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
        RETURNING revision`,[barberId,snap.queue_date,userId,snap.revision]);
      if(changed.rowCount!==1)throw error(409,'day_changed','Kun o‘zgargan. Yangilang.');
      await client.query(`INSERT INTO barber_day_close_events
        (barber_id,local_date,actor_user_id,action,revision) VALUES($1,$2::date,$3,'reopened',$4)`,
        [barberId,snap.queue_date,userId,changed.rows[0].revision]);
      return {payload:{...snap,closed:false,revision:changed.rows[0].revision,
        read_only:false,replayed:false}};
    });
  }
  async function join(req,res) {
    let label,key;
    try {requireBarber(req);label=validateLabel(req.body?.label);
      key=req.body?.request_id;
      if(typeof key!=='string'||! /^[0-9a-f]{32}$/.test(key))
        throw error(400,'invalid_request_id','Har bir yangi navbat uchun noyob so‘rov ID kerak.');
    } catch(e){return respondError(res,e);}
    return transaction(req,res,async (client,{barberId,userId})=>{
      // Request ID is globally unique per barber; a lost HTTP response can be retried safely.
      const duplicate=await client.query(`${queueSelect} WHERE barber_id=$1 AND request_key=$2 FOR UPDATE`,[barberId,key]);
      if(duplicate.rowCount){
        if(duplicate.rows[0].display_label!==label) throw error(409,'request_id_reused','So‘rov ID boshqa navbat uchun ishlatilgan.');
        // The request key remains unique across dates. A late replay must NOT
        // present yesterday's waiting ticket as a fresh ticket for today.
        // Use PostgreSQL time in the same transaction, not the app server clock.
        const isToday=await client.query(`SELECT EXISTS(SELECT 1 FROM walkin_queue
          WHERE barber_id=$1 AND request_key=$2
            AND queue_date=(statement_timestamp() AT TIME ZONE 'Asia/Tashkent')::date) AS today`,
          [barberId,key]);
        if(isToday.rows[0]?.today!==true)
          throw error(410,'queue_request_expired','Bu navbat boshqa kunga tegishli. Bugun yangi so‘rov ID bilan navbatga qo‘shing.');
        return {payload:{entry:publicFields(duplicate.rows[0]),replayed:true}};
      }
      const open=await client.query(`SELECT EXISTS(
        SELECT 1 FROM ustara_effective_day_schedule($1,(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date) s
        WHERE (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::time >= s.start_time
          AND (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::time < s.end_time
      ) AS open_now`,[barberId]);
      if(open.rows[0]?.open_now!==true) throw error(409,'barber_closed','Ish vaqti yopiq. Yangi walk-in navbat qabul qilinmaydi.');
      // v110: a barber can pass the opening-hours preflight just before
      // midnight/closing. Bind the inserted queue_date and the final schedule
      // check to ONE database clock sample, rather than relying on DEFAULT.
      const inserted=await client.query(`WITH now_at AS (SELECT clock_timestamp() AS at)
        INSERT INTO walkin_queue(barber_id,request_key,display_label,queue_date)
        SELECT $1,$2,$3,(now_at.at AT TIME ZONE 'Asia/Tashkent')::date FROM now_at
        WHERE EXISTS(SELECT 1 FROM ustara_effective_day_schedule($1,
          (now_at.at AT TIME ZONE 'Asia/Tashkent')::date) s
          WHERE (now_at.at AT TIME ZONE 'Asia/Tashkent')::time>=s.start_time
            AND (now_at.at AT TIME ZONE 'Asia/Tashkent')::time<s.end_time)
        RETURNING *`,[barberId,key,label]);
      if(inserted.rowCount!==1)throw error(409,'barber_closed','Ish vaqti yoki kun o‘zgargan. Navbatga qayta qo‘shiling.');
      await client.query(`INSERT INTO walkin_queue_events(entry_id,actor_user_id,action) VALUES($1,$2,'joined')`,[inserted.rows[0].id,userId]);
      return {httpStatus:201,payload:{entry:publicFields(inserted.rows[0]),replayed:false}};
    });
  }
  // #23: observed call -> physical arrival -> service start -> completion.
  // Existing pre-v96 clients may still go called -> in_service (no arrival_at).
  async function markArrived(req,res) {
    const entryId=safeId(req.params?.id);
    if(!entryId)return respondError(res,error(400,'invalid_id','Navbat ID noto‘g‘ri.'));
    if(req.body?.expected_status!=='called')
      return respondError(res,error(400,'invalid_precondition','Chaqirilgan holatni tasdiqlang.'));
    return transaction(req,res,async(client,{barberId,userId})=>{
      const found=await client.query(`${queueSelect} WHERE barber_id=$1 AND id=$2 FOR UPDATE`,[barberId,entryId]);
      if(!found.rowCount)throw error(404,'not_found','Navbat topilmadi.');
      const item=found.rows[0];
      if(item.status==='arrived')return {payload:{entry:publicFields(item),replayed:true}};
      if(item.status!=='called')throw error(409,'queue_changed','Navbat holati o‘zgargan. Yangilang.');
      const changed=await client.query(`UPDATE walkin_queue SET status='arrived',arrived_at=clock_timestamp()
        WHERE id=$1 AND barber_id=$2 AND status='called'
          AND queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date RETURNING *`,
        [entryId,barberId]);
      if(!changed.rowCount)throw error(409,'queue_changed','Bugungi navbatni yangilang.');
      await client.query(`INSERT INTO walkin_queue_events(entry_id,actor_user_id,action)
        VALUES($1,$2,'arrived')`,[entryId,userId]);
      await client.query(`UPDATE walkin_queue_notification_outbox SET status='cancelled'
        WHERE entry_id=$1 AND event='called' AND status='pending'`,[entryId]);
      return {payload:{entry:publicFields(changed.rows[0]),replayed:false}};
    });
  }
  // Legacy start from 'called' remains supported, but new UI starts from 'arrived'.
  // No silent service start, no guest-controlled writes, no cross-day starts.
  async function startService(req,res) {
    const entryId=safeId(req.params?.id);
    if(!entryId)return respondError(res,error(400,'invalid_id','Navbat ID noto‘g‘ri.'));
    if(!['called','arrived'].includes(req.body?.expected_status))
      return respondError(res,error(400,'invalid_precondition','Tasdiqlangan chaqiruv yoki kelish holati talab qilinadi.'));
    return transaction(req,res,async(client,{barberId,userId})=>{
      const found=await client.query(`${queueSelect} WHERE barber_id=$1 AND id=$2 FOR UPDATE`,[barberId,entryId]);
      if(!found.rowCount)throw error(404,'not_found','Navbat topilmadi.');
      const item=found.rows[0];
      if(item.status==='in_service')
        return {payload:{entry:publicFields(item),replayed:true}};
      if(item.status!==req.body.expected_status)
        throw error(409,'queue_changed','Chaqirilgan navbat holati o‘zgargan. Yangilang.');
      const changed=await client.query(`UPDATE walkin_queue SET status='in_service',started_at=clock_timestamp()
        WHERE id=$1 AND barber_id=$2 AND status=$3
          AND queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date RETURNING *`,
        [entryId,barberId,item.status]);
      if(!changed.rowCount)throw error(409,'queue_changed','Bugungi navbatni yangilang.');
      await client.query(`INSERT INTO walkin_queue_events(entry_id,actor_user_id,action)
        VALUES($1,$2,'started')`,[entryId,userId]);
      // A late, unsent 'called' Telegram notice is stale once service starts.
      // Never mutate an in-flight lease: the worker rechecks its own claim.
      await client.query(`UPDATE walkin_queue_notification_outbox SET status='cancelled'
        WHERE entry_id=$1 AND event='called' AND status='pending'`,[entryId]);
      return {payload:{entry:publicFields(changed.rows[0]),replayed:false}};
    });
  }
  async function callNext(req,res) {
    let expected;
    try {expected=callPrecondition(req.body);} catch(e){return respondError(res,e);}
    return transaction(req,res,async(client,{barberId,userId})=>{
      const current=await client.query(`${queueSelect} WHERE barber_id=$1 AND queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date AND status='called' FOR UPDATE`,[barberId]);
      if(current.rowCount){
        // After an uncertain response, the SAME originally observed ticket may
        // be replayed; a different already-called ticket is a stale view.
        if(expected.provided && safeId(current.rows[0].id)!==expected.id)
          throw error(409,'queue_changed','Navbat o‘zgargan. Yangilang va qayta urinib ko‘ring.');
        // Repair pending invitations left by pre-v46 call-next retries; never
        // duplicate the call event or its Telegram notification.
        await cancelUnconfirmedQueueOffers(client,current.rows[0].id);
        return {payload:{entry:publicFields(current.rows[0]),replayed:true}};
      }
      const arrived=await client.query(`${queueSelect} WHERE barber_id=$1
        AND queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
        AND status='arrived' FOR UPDATE`,[barberId]);
      if(arrived.rowCount)throw error(409,'customer_arrived',
        'Mijoz kelgan. Xizmatni boshlang yoki navbatni yakunlang.');
      const servicing=await client.query(`${queueSelect} WHERE barber_id=$1
        AND queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
        AND status='in_service' FOR UPDATE`,[barberId]);
      if(servicing.rowCount)throw error(409,'service_in_progress',
        'Oldingi mijozning xizmati tugamagan. Avval yakunlang.');
      const waiting=await client.query(`${queueSelect} WHERE barber_id=$1 AND queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date AND status='waiting' ORDER BY queue_position ASC NULLS LAST,id LIMIT 1 FOR UPDATE`,[barberId]);
      if(!waiting.rowCount){
        if(expected.provided)throw error(409,'queue_changed','Navbat yangilangan. Qayta tekshiring.');
        throw error(404,'queue_empty','Bugungi navbatda kutayotgan mijoz yo‘q.');
      }
      if(expected.provided && safeId(waiting.rows[0].id)!==expected.id)
        throw error(409,'queue_changed','Navbat tartibi o‘zgargan. Qayta tekshiring.');
      const changed=await client.query(`UPDATE walkin_queue SET status='called',called_at=clock_timestamp()
        WHERE id=$1 AND barber_id=$2 AND status='waiting'
          AND queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date RETURNING *`,
        [waiting.rows[0].id,barberId]);
      if(!changed.rowCount)throw error(409,'queue_changed','Navbat o‘zgardi, qayta urinib ko‘ring.');
      await client.query(`INSERT INTO walkin_queue_events(entry_id,actor_user_id,action) VALUES($1,$2,'called')`,[changed.rows[0].id,userId]);
      // Calling a guest supersedes the unconfirmed early-slot invitation.
      // This shares the same transaction, so a concurrent acceptance cannot
      // leave a phantom opening on a ticket that is no longer waiting.
      await cancelUnconfirmedQueueOffers(client,changed.rows[0].id);
      // Enqueue only when the ticket holder explicitly linked a Telegram chat.
      // Unique (entry_id,event) is the durable DB-level idempotency key.
      await client.query(`INSERT INTO walkin_queue_notification_outbox(entry_id,event,chat_id)
        SELECT $1,'called',s.chat_id FROM walkin_queue_telegram_subscriptions s WHERE s.entry_id=$1
        ON CONFLICT(entry_id,event) DO NOTHING`,[changed.rows[0].id]);
      return {payload:{entry:publicFields(changed.rows[0]),replayed:false}};
    });
  }
  async function finish(req,res) {
    const entryId=safeId(req.params?.id),status=req.body?.status;
    if(!entryId)return res.status(400).json({code:'invalid_id',message:'Navbat ID noto‘g‘ri.'});
    if(!['served','missed','left'].includes(status))return res.status(400).json({code:'invalid_status',message:'Holat noto‘g‘ri.'});
    let expectedStatus;
    try {expectedStatus=finishPrecondition(req.body);} catch(e){return respondError(res,e);}
    return transaction(req,res,async(client,{barberId,userId})=>{
      const result=await client.query(`${queueSelect} WHERE barber_id=$1 AND id=$2 FOR UPDATE`,[barberId,entryId]);
      if(!result.rowCount)throw error(404,'not_found','Navbat topilmadi.');
      const item=result.rows[0];
      if(item.status===status){
        // Repair legacy pending deliveries without repeating status/event writes.
        await cleanupTerminalQueue(client,entryId);
        return {payload:{entry:publicFields(item),replayed:true}};
      }
      // A status changed by another device must never be finished based on a
      // stale button. Idempotent replay of the *same final status* above is safe.
      if(expectedStatus!==null && expectedStatus!==item.status)
        throw error(409,'queue_changed','Navbat holati o‘zgargan. Yangilang va qayta tekshiring.');
      if(!((item.status==='called' && ['served','missed','left'].includes(status))
           || (item.status==='arrived' && status==='left')
           || (item.status==='in_service' && status==='served')
           || (item.status==='waiting' && status==='left')))
        throw error(409,'invalid_transition','Navbat holatini bunday o‘zgartirib bo‘lmaydi.');
      // A staff member must not finish yesterday's *still-active* ticket
      // today; the GET list only exposes today's active queue. Terminal
      // replays above remain idempotent for historical records.
      const changed=await client.query(`UPDATE walkin_queue SET status=$1,finished_at=clock_timestamp()
        WHERE barber_id=$2 AND id=$3 AND status=$4
          AND queue_date=(statement_timestamp() AT TIME ZONE 'Asia/Tashkent')::date RETURNING *`,
        [status,barberId,entryId,item.status]);
      if(!changed.rowCount)throw error(409,'queue_changed','Navbat o‘zgardi, qayta urinib ko‘ring.');
      await client.query(`INSERT INTO walkin_queue_events(entry_id,actor_user_id,action) VALUES($1,$2,$3)`,[entryId,userId,status]);
      // The same idempotent terminal cleanup is shared with guest self-exit.
      await cleanupTerminalQueue(client,entryId);
      return {payload:{entry:publicFields(changed.rows[0]),replayed:false}};
    });
  }
  // Reorder only today's waiting queue, under the same advisory mutex as join/call/QR approve.
  // A reason and the client's observed order prevent silent/stale reshuffles.
  async function reorder(req,res) {
    const entryId=safeId(req.params?.id),direction=req.body?.direction,reason=req.body?.reason;
    const expected=req.body?.expected_order;
    if(!entryId || !['up','down'].includes(direction) || typeof reason!=='string' ||
       reason.trim().length<10 || reason.trim().length>200 || /[\x00-\x1f\x7f]/.test(reason))
      return res.status(400).json({code:'invalid_reorder',message:'Yo‘nalish va 10–200 belgili sabab kerak.'});
    if(!Array.isArray(expected)||expected.length===0||expected.length>100||
       expected.some(x=>!safeId(x))||new Set(expected.map(Number)).size!==expected.length)
      return res.status(400).json({code:'invalid_order',message:'Navbat ro‘yxatini yangilang.'});
    return transaction(req,res,async(client,{barberId,userId})=>{
      const waiting=await client.query(`SELECT id FROM walkin_queue
         WHERE barber_id=$1 AND queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
         AND status='waiting' ORDER BY queue_position ASC NULLS LAST,id FOR UPDATE`,[barberId]);
      const ids=waiting.rows.map(x=>Number(x.id));
      if(ids.length!==expected.length||ids.some((id,i)=>id!==Number(expected[i])))
        throw error(409,'queue_changed','Navbat o‘zgargan. Yangilang va qayta urinib ko‘ring.');
      const old=ids.indexOf(entryId);
      if(old<0)throw error(404,'not_waiting','Mijoz bugungi kutish navbatida yo‘q.');
      const target=old+(direction==='up'?-1:1);
      if(target<0||target>=ids.length)
        throw error(409,'already_at_edge','Bu mijozni ko‘rsatilgan yo‘nalishda surib bo‘lmaydi.');
      [ids[old],ids[target]]=[ids[target],ids[old]];
      // Between the SELECT and UPDATE the calendar day may change, even
      // while the transaction holds the barber mutex. Guard the actual write
      // with the *current PostgreSQL date*, then require every row to match.
      // If one row no longer qualifies, ROLLBACK prevents partial reorders
      // and prevents a misleading audit entry.
      const reordered=await client.query(`UPDATE walkin_queue AS w SET queue_position = ranks.rank::int
        FROM unnest($1::bigint[]) WITH ORDINALITY AS ranks(id,rank)
        WHERE w.id=ranks.id AND w.barber_id=$2 AND w.status='waiting'
          AND w.queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date`,[ids,barberId]);
      if(reordered.rowCount!==ids.length)
        throw error(409,'queue_changed','Navbat sanasi yoki tartibi o‘zgargan. Yangilang.');
      await client.query(`INSERT INTO walkin_queue_reorder_events
        (barber_id,entry_id,actor_user_id,old_position,new_position,reason)
        VALUES($1,$2,$3,$4,$5,$6)`,[barberId,entryId,userId,old+1,target+1,reason.trim()]);
      return {payload:{changed:true,entry_id:entryId,old_position:old+1,new_position:target+1}};
    });
  }
  return {list,join,callNext,markArrived,startService,finish,reorder,dayClosePreview,closeDay,reopenDay};
}
module.exports={createHandlers,validateLabel};
