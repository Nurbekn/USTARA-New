'use strict';
const crypto=require('node:crypto');
const pool=require('../db');
const {isPgConnectionBroken}=require('../utils/pgConnectionHealth');
const {qrSvg}=require('../utils/qrSvg');
const {publicQueueLink,validBasePath,validLanguage}=require('../services/v154PublicQueueLink');
const {validateLabel}=require('./walkinQueueController');
const {estimateWait,typicalMinutes}=require('../services/queueLiveEstimate');
const fail=(status,code,message)=>Object.assign(new Error(message),{status,code});
const isKey=s=>typeof s==='string'&&/^[a-f0-9]{32}$/.test(s);
const isToken=s=>typeof s==='string'&&/^[a-f0-9]{48}$/.test(s);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const uid=v=>{const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null;};
const tokenHash=s=>hash(`ustara-walkin-qr-v22:${s}`);
const requestHash=s=>hash(`ustara-walkin-request-v22:${s}`);
const isFullQrDate=value=>value instanceof Date ? Number.isFinite(value.getTime())
  : typeof value==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));

function errorResponse(res,e){
 res.set('Cache-Control','no-store');
 if(e.commitUncertain)return res.status(503).json({code:'queue_result_unknown',
  message:'QR amali natijasi noaniq. Avval holatni tekshiring, avtomatik takrorlamang.'});
 if(e.status)return res.status(e.status).json({code:e.code,message:e.message});
 if(['40P01','55P03','57014','23505'].includes(e.code))return res.status(409).json({code:'queue_busy',message:'Navbat o‘zgardi. Qayta urinib ko‘ring.'});
 console.error('walk-in qr',e.code||'error');
 return res.status(503).json({code:'queue_unavailable',message:'QR navbat vaqtincha ishlamayapti.'});
}
function publicOrigin(req,origin){
 if(typeof origin!=='string'||origin.length>240)throw fail(400,'invalid_origin','Sayt manzili noto‘g‘ri.');
 let url;try{url=new URL(origin);}catch{throw fail(400,'invalid_origin','Sayt manzili noto‘g‘ri.');}
 if(url.origin!==origin||url.pathname!=='/'||url.search||url.hash||url.username||url.password||
    !(['https:'].includes(url.protocol)||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))
  throw fail(400,'invalid_origin','Faqat xavfsiz sayt manzili mumkin.');
 if(req.headers?.origin && req.headers.origin!==origin)throw fail(403,'origin_mismatch','Sayt manzili mos emas.');
 // Honour an explicit allowed-origin list in staging too; never create an
 // official-looking QR that redirects guests to an arbitrary HTTPS domain.
 const allowed=(process.env.CORS_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
 if((process.env.NODE_ENV==='production'||allowed.length>0)&&!allowed.includes(origin))
  throw fail(403,'origin_not_allowed','Bu sayt manziliga ruxsat yo‘q.');
 return origin;
}
function requireBarber(req){
 if(req.user?.role!=='barber')throw fail(403,'forbidden','Bu amal faqat sartarosh uchun.');
 const barberId=uid(req.user.profileId),userId=uid(req.user.id);
 if(!barberId||!userId)throw fail(401,'invalid_session','Sartarosh sessiyasi yaroqsiz.');
 return {barberId,userId};
}
function createHandlers(db=pool){
 async function tx(res,cb){
  let c,started=false,broken=false,commitStarted=false;
  try{
   c=await db.connect();await c.query('BEGIN');started=true;
   await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='15s'");
   const result=await cb(c);
   // A COMMIT transport failure may happen AFTER PostgreSQL committed.
   // Never claim success, retry the mutation, or return this connection to the pool.
   commitStarted=true;await c.query('COMMIT');started=false;commitStarted=false;
   res.set('Cache-Control','no-store');return res.status(result.status||200).json(result.body);
  }catch(e){
   if(isPgConnectionBroken(e))broken=true;
   if(commitStarted){broken=true;e.commitUncertain=true;}
   else if(c&&started)try{await c.query('ROLLBACK');}catch{broken=true;}
   return errorResponse(res,e);
  }finally{if(c)c.release(broken);}
 }
 // Match the authenticated account to the barber profile, and hold both
 // identity SHARE locks through COMMIT. User pause/delete locks user first;
 // take that lock BEFORE the barber advisory lock to avoid lock inversion.
 async function assertBarber(c,{barberId,userId}){
  const valid=await c.query(`SELECT b.id FROM barbers b JOIN users u ON u.id=b.user_id
   WHERE b.id=$1 AND b.user_id=$2 AND b.verification_status='approved'
     AND u.role='barber' AND u.deactivated_at IS NULL FOR SHARE OF b,u`,[barberId,userId]);
  if(!valid.rowCount)throw fail(403,'barber_unavailable','Faol tasdiqlangan sartarosh hisobi kerak.');
  await c.query('SELECT pg_advisory_xact_lock($1)',[barberId]);
 }
 async function tokenCreate(req,res){
  let actor,origin,base_path,lang;try{
   actor=requireBarber(req);
   origin=publicOrigin(req,req.body?.origin);
   // Reject malformed QR destinations BEFORE touching the database.
   base_path=validBasePath(req.body?.base_path);
   lang=req.body?.lang;validLanguage(lang);
  }catch(e){return errorResponse(res,e);}
  return tx(res,async c=>{
   await assertBarber(c,actor);
   const closed=await c.query(`SELECT EXISTS(SELECT 1 FROM barber_day_closures
     WHERE barber_id=$1 AND local_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
       AND is_closed) AS closed`,[actor.barberId]);
   if(closed.rows[0]?.closed!==false)throw fail(409,'barber_closed','Ish kuni yopilgan. QR yaratib bo‘lmaydi.');
   const open=await c.query(`SELECT EXISTS(SELECT 1 FROM ustara_effective_day_schedule($1,
     (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date) s
     WHERE (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::time>=s.start_time
       AND (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::time<s.end_time) AS open_now`,[actor.barberId]);
   if(open.rows[0]?.open_now!==true)throw fail(409,'barber_closed','Ish vaqti yopiq. QR yaratib bo‘lmaydi.');
   const issued=await c.query(`SELECT count(*)::int AS total FROM walkin_qr_tokens
      WHERE barber_id=$1 AND created_at>clock_timestamp()-interval '1 minute'`,[actor.barberId]);
   if(issued.rowCount!==1 || !Number.isSafeInteger(issued.rows[0]?.total) || issued.rows[0].total<0)
    throw fail(503,'queue_unavailable','QR limitini tekshirib bo‘lmadi.');
   if(issued.rows[0].total>=6)throw fail(429,'qr_issue_limit','Bir daqiqada juda ko‘p QR yaratildi. Biroz kuting.');
   // Lock setting row so an Admin change and QR issuance have deterministic order.
   const setting=await c.query('SELECT ttl_minutes FROM walkin_qr_settings WHERE id=1 FOR SHARE');
   const minutes=Number(setting.rows[0]?.ttl_minutes);
   if(!Number.isInteger(minutes)||minutes<1||minutes>120)throw fail(503,'qr_settings_unavailable','QR sozlamasi mavjud emas.');
   const raw=crypto.randomBytes(24).toString('hex');
   const added=await c.query(`INSERT INTO walkin_qr_tokens(barber_id,token_hash,expires_at)
     SELECT $1,$2,clock_timestamp()+($3::integer * interval '1 minute')
     WHERE EXISTS(SELECT 1 FROM ustara_effective_day_schedule($1,
       (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date) s
       WHERE (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::time>=s.start_time
         AND (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::time<s.end_time)
     RETURNING expires_at`,[actor.barberId,tokenHash(raw),minutes]);
   if(added.rowCount!==1)throw fail(409,'barber_closed','Ish vaqti yopiq. QR yaratib bo‘lmaydi.');
   if(!isFullQrDate(added.rows[0]?.expires_at))throw fail(503,'queue_unavailable','QR muddatini tekshirib bo‘lmadi.');
   const url=publicQueueLink(origin,raw,{base_path,lang});
   const svg=qrSvg(url);
   return {status:201,body:{url,svg_data_uri:`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
     expires_at:added.rows[0].expires_at,ttl_minutes:minutes}};
  });
 }
 async function requestJoin(req,res){
  const raw=req.body?.token,key=req.body?.request_id;
  let label;try{
   if(!isToken(raw)||!isKey(key))throw fail(400,'invalid_qr','QR kodi yoki so‘rov ID noto‘g‘ri.');
   label=validateLabel(req.body?.label);
  }catch(e){return errorResponse(res,e);}
  return tx(res,async c=>{
   // Resolve token only by its SHA-256 hash; never store a raw QR URL/token.
   const q=await c.query(`SELECT id,barber_id,used_at,
      (expires_at>clock_timestamp() AND
       (created_at AT TIME ZONE 'Asia/Tashkent')::date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date)
       AS token_live FROM walkin_qr_tokens
      WHERE token_hash=$1 FOR UPDATE`,[tokenHash(raw)]);
   if(!q.rowCount)throw fail(404,'invalid_qr','QR kodi topilmadi.');
   const t=q.rows[0];
   // An account may be deactivated while this request waits for a token.
   // Take identity read locks BEFORE the barber advisory lock and hold them
   // through COMMIT. Staff-account changes take the same ordering.
   const valid=await c.query(`SELECT b.id FROM barbers b JOIN users u ON u.id=b.user_id
     WHERE b.id=$1 AND b.verification_status='approved' AND u.role='barber'
       AND u.deactivated_at IS NULL FOR SHARE OF b,u`,[t.barber_id]);
   if(!valid.rowCount)throw fail(403,'barber_unavailable','Sartarosh navbatni qabul qilmayapti.');
   await c.query('SELECT pg_advisory_xact_lock($1)',[t.barber_id]);
   const old=await c.query(`SELECT id,request_hash,display_label,status,
      (created_at>clock_timestamp()-interval '30 minutes' AND
       (created_at AT TIME ZONE 'Asia/Tashkent')::date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date)
       AS pending_live FROM walkin_qr_requests WHERE qr_token_id=$1`,[t.id]);
   if(old.rowCount){
    const r=old.rows[0];
    if(r.request_hash!==requestHash(key)||r.display_label!==label)
      throw fail(409,'qr_used','QR kodi allaqachon ishlatilgan. Sartaroshdan yangi QR so‘rang.');
    return {body:{status:r.status==='pending'&&r.pending_live!==true?'expired':r.status,
      replayed:true}};
   }
   if(t.used_at||t.token_live!==true)throw fail(410,'qr_expired','QR muddati tugagan. Yangisini so‘rang.');
   // The initial expiry snapshot was read before waiting for the barber lock.
   // Recheck against the authoritative DB clock once the lock is held.
   const fresh=await c.query(`SELECT (expires_at>clock_timestamp() AND
     (created_at AT TIME ZONE 'Asia/Tashkent')::date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date)
     AS token_live FROM walkin_qr_tokens WHERE id=$1`,[t.id]);
   if(fresh.rows[0]?.token_live!==true)throw fail(410,'qr_expired','QR muddati tugagan. Yangisini so‘rang.');
   const open=await c.query(`SELECT EXISTS(SELECT 1 FROM ustara_effective_day_schedule($1,
     (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date) s
     WHERE (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::time >= s.start_time
       AND (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::time < s.end_time) AS open_now`,[t.barber_id]);
   if(!open.rows[0]?.open_now)throw fail(409,'barber_closed','Sartarosh ish vaqti tugagan.');
   const pending=await c.query(`SELECT count(*)::int AS total FROM walkin_qr_requests
     WHERE barber_id=$1 AND status='pending' AND created_at>clock_timestamp()-interval '30 minutes'
       AND (created_at AT TIME ZONE 'Asia/Tashkent')::date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date`,[t.barber_id]);
   if(pending.rowCount!==1 || !Number.isSafeInteger(pending.rows[0]?.total) || pending.rows[0].total<0)
    throw fail(503,'queue_unavailable','QR so‘rovlari sonini tekshirib bo‘lmadi.');
   if(pending.rows[0].total>=20)throw fail(429,'queue_full','Hozir QR so‘rovlari ko‘p. Keyinroq urinib ko‘ring.');
   // v52: enforce the token's live expiry in the INSERT statement itself.
   // It may expire during schedule/capacity queries after the initial check.
   const created=await c.query(`INSERT INTO walkin_qr_requests(qr_token_id,barber_id,request_hash,request_key,display_label)
     SELECT id,barber_id,$3,$4,$5 FROM walkin_qr_tokens
     WHERE id=$1 AND barber_id=$2 AND used_at IS NULL
       AND expires_at>clock_timestamp()
       AND (created_at AT TIME ZONE 'Asia/Tashkent')::date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
       RETURNING id`,
     [t.id,t.barber_id,requestHash(key),key,label]);
   if(created.rowCount!==1)throw fail(410,'qr_expired','QR muddati tugagan. Yangisini so‘rang.');
   // v52: do not report success if this token could not be consumed.
   // v53: token can expire after INSERT but before its final consumption.
   // Roll back the request too if the last write crosses the DB deadline.
   // v54: the shop may close while schedule/capacity/insert queries run.
   // Do not consume the token or commit the QR request unless the *final*
   // database write also sees an open schedule in Tashkent local time.
   const used=await c.query(`UPDATE walkin_qr_tokens SET used_at=clock_timestamp()
     WHERE id=$1 AND used_at IS NULL AND expires_at>clock_timestamp()
       AND (created_at AT TIME ZONE 'Asia/Tashkent')::date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
       AND EXISTS (SELECT 1 FROM ustara_effective_day_schedule(barber_id,
         (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date) s
         WHERE (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::time>=s.start_time
           AND (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::time<s.end_time)
     RETURNING id`,[t.id]);
   if(used.rowCount!==1){
    const status=await c.query(`SELECT used_at IS NOT NULL AS used,
      (expires_at>clock_timestamp() AND
       (created_at AT TIME ZONE 'Asia/Tashkent')::date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date)
       AS token_live FROM walkin_qr_tokens WHERE id=$1`,[t.id]);
    if(status.rows[0]?.used===false && status.rows[0]?.token_live===false)
     throw fail(410,'qr_expired','QR muddati tugagan. Yangisini so‘rang.');
    if(status.rows[0]?.used===true)throw fail(409,'qr_used','QR kodi allaqachon ishlatilgan.');
    throw fail(409,'barber_closed','Sartarosh ish vaqti tugagan. Yangi QR so‘rang.');
   }
   await c.query(`INSERT INTO walkin_qr_request_events(request_id,actor_user_id,action)
     VALUES($1,NULL,'requested')`,[created.rows[0].id]);
   return {status:202,body:{status:'pending',replayed:false}};
  });
 }
 async function requestStatus(req,res){
  const raw=req.body?.token,key=req.body?.request_id;
  if(!isToken(raw)||!isKey(key))return errorResponse(res,fail(400,'invalid_qr','QR kodi yoki so‘rov ID noto‘g‘ri.'));
  try{
   // Token + request secret identify ONLY this guest's ticket. No labels or other IDs leak.
   const data=await db.query(`WITH ranked AS (
       SELECT id,ROW_NUMBER() OVER (ORDER BY queue_position ASC NULLS LAST,id)::int AS position
       FROM walkin_queue WHERE status='waiting'
         AND queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
         AND barber_id=(SELECT r.barber_id FROM walkin_qr_requests r
           JOIN walkin_qr_tokens t ON t.id=r.qr_token_id
           WHERE t.token_hash=$1 AND r.request_hash=$2)
     )
     SELECT r.status,
       (r.created_at>clock_timestamp()-interval '30 minutes' AND
        (r.created_at AT TIME ZONE 'Asia/Tashkent')::date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date) AS pending_live,
       q.status AS queue_status,q.queue_date,
       ranked.position,
       (q.queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date) AS queue_today,
       (offer.expires_at>clock_timestamp()) AS offer_live,
       (offer.start_at>clock_timestamp()) AS offer_upcoming,
       offer.id AS offer_id,offer.status AS offer_status,offer.start_at AS offer_starts_at,offer.expires_at AS offer_expires_at,
       (offer.decided_at + interval '2 minutes') AS confirmation_deadline,
       (clock_timestamp() < offer.decided_at + interval '2 minutes') AS confirmation_live,
       EXISTS(SELECT 1 FROM walkin_queue_telegram_subscriptions sub WHERE sub.entry_id=q.id) AS telegram_linked,
       EXISTS(SELECT 1 FROM walkin_queue_telegram_subscriptions sub WHERE sub.entry_id=q.id AND sub.offers_consent_at IS NOT NULL) AS offers_enabled,
       EXISTS(SELECT 1 FROM walkin_queue w WHERE w.barber_id=r.barber_id
         AND w.queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
         AND w.status IN ('called','arrived','in_service')) AS has_called,
       (SELECT COALESCE(ROUND(AVG(s.duration_minutes)/5)*5,20)::int FROM services s
         WHERE s.barber_id=r.barber_id AND s.duration_minutes>0
           AND COALESCE((to_jsonb(s)->>'is_active')::boolean,TRUE)) AS typical_minutes
     FROM walkin_qr_requests r JOIN walkin_qr_tokens t ON t.id=r.qr_token_id
     LEFT JOIN walkin_queue q ON q.id=r.queue_entry_id
     LEFT JOIN ranked ON ranked.id=q.id
     LEFT JOIN LATERAL (
       SELECT f.id,f.status,f.decided_at,o.start_at,f.expires_at FROM smart_booking_offers f
       JOIN smart_booking_openings o ON o.id=f.opening_id
       WHERE f.entry_id=q.id AND f.status IN ('pending','accepted')
       ORDER BY f.id DESC LIMIT 1
     ) offer ON TRUE
     WHERE t.token_hash=$1 AND r.request_hash=$2`,[tokenHash(raw),requestHash(key)]);
   res.set('Cache-Control','no-store');
   if(!data.rowCount)return res.status(404).json({code:'not_found',message:'So‘rov topilmadi.'});
   const item=data.rows[0];
   const status=item.status==='pending' && item.pending_live!==true
     ?'expired':item.status;
   if(status!=='approved')return res.json({status});
   // A stale-day waiting/called ticket must not appear as a live queue.
   // Keep historical terminal statuses without leaking old subscription flags.
   const queueStatus=['waiting','called','arrived','in_service','served','missed','left'].includes(item.queue_status)
     && (item.queue_today===true || ['served','missed','left'].includes(item.queue_status))
     ?item.queue_status:null;
   const position=queueStatus==='waiting' && Number.isSafeInteger(Number(item.position)) && Number(item.position)>0
     ?Number(item.position):null;
   const estimated_wait=position===null?null:estimateWait(position,item.has_called===true,typicalMinutes(item.typical_minutes));
   const smart_offer=queueStatus==='waiting' && item.offer_id
     && item.queue_today===true && item.offer_upcoming===true
     && ((item.offer_status==='accepted'&&item.confirmation_live===true)|| (item.offer_status==='pending'&&item.offer_live===true))
     ?{id:Number(item.offer_id),status:item.offer_status,starts_at:item.offer_starts_at,expires_at:item.offer_expires_at,
         confirmation_deadline:item.offer_status==='accepted'?item.confirmation_deadline:null}:null;
   return res.json({status,queue_status:queueStatus,position,estimated_wait,
     telegram_linked:item.queue_today===true&&item.telegram_linked===true,
     offers_enabled:item.queue_today===true&&item.offers_enabled===true,smart_offer});
  }catch(e){return errorResponse(res,e);}
 }
 async function pendingList(req,res){
  let actor;try{actor=requireBarber(req);}catch(e){return errorResponse(res,e);}
  return tx(res,async c=>{
   await assertBarber(c,actor);
   const pending=await c.query(`SELECT id,display_label,created_at FROM walkin_qr_requests
     WHERE barber_id=$1 AND status='pending' AND created_at>clock_timestamp()-interval '30 minutes'
       AND (created_at AT TIME ZONE 'Asia/Tashkent')::date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
     ORDER BY id ASC LIMIT 25`,[actor.barberId]);
   return {body:{pending:pending.rows}};
  });
 }
 async function decide(req,res){
  const id=uid(req.params?.id),decision=req.body?.decision;
  let actor;try{actor=requireBarber(req);
   if(!id||!['approve','reject'].includes(decision))throw fail(400,'invalid_decision','Tasdiqlash qarori noto‘g‘ri.');
  }catch(e){return errorResponse(res,e);}
  return tx(res,async c=>{
   await assertBarber(c,actor);
   const found=await c.query(`SELECT id,barber_id,request_key,display_label,status,queue_entry_id,
      (created_at>clock_timestamp()-interval '30 minutes' AND
       (created_at AT TIME ZONE 'Asia/Tashkent')::date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date)
       AS pending_live FROM walkin_qr_requests WHERE id=$1 AND barber_id=$2 FOR UPDATE`,[id,actor.barberId]);
   if(!found.rowCount)throw fail(404,'not_found','QR so‘rovi topilmadi.');
   const r=found.rows[0],final=decision==='approve'?'approved':'rejected';
   if(r.status===final)return {body:{status:r.status,replayed:true,queue_entry_id:r.queue_entry_id}};
   if(r.status!=='pending')throw fail(409,'already_decided','Bu so‘rov avval ko‘rib chiqilgan.');
   if(r.pending_live!==true)throw fail(410,'request_expired','QR so‘rovining vaqti tugagan.');
   let entryId=null;
   if(decision==='approve'){
    const open=await c.query(`SELECT EXISTS(SELECT 1 FROM ustara_effective_day_schedule($1,
       (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date) s
       WHERE (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::time>=s.start_time
         AND (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::time<s.end_time) AS open_now`,[actor.barberId]);
    if(!open.rows[0]?.open_now)throw fail(409,'barber_closed','Ish vaqti tugagan. So‘rovni tasdiqlab bo‘lmaydi.');
    // v110: no yesterday's QR request may become today's ticket, and
    // hours are rechecked at the actual queue INSERT (not just preflight).
    const joined=await c.query(`WITH now_at AS (SELECT clock_timestamp() AS at)
      INSERT INTO walkin_queue(barber_id,request_key,display_label,queue_date)
      SELECT $1,$2,$3,(now_at.at AT TIME ZONE 'Asia/Tashkent')::date
      FROM now_at,walkin_qr_requests r
      WHERE r.id=$4 AND r.barber_id=$1 AND r.status='pending'
        AND r.created_at>now_at.at-interval '30 minutes'
        AND (r.created_at AT TIME ZONE 'Asia/Tashkent')::date=(now_at.at AT TIME ZONE 'Asia/Tashkent')::date
        AND EXISTS(SELECT 1 FROM ustara_effective_day_schedule($1,
          (now_at.at AT TIME ZONE 'Asia/Tashkent')::date) s
          WHERE (now_at.at AT TIME ZONE 'Asia/Tashkent')::time>=s.start_time
            AND (now_at.at AT TIME ZONE 'Asia/Tashkent')::time<s.end_time)
      RETURNING id`,[actor.barberId,r.request_key,r.display_label,id]);
    if(joined.rowCount!==1)throw fail(409,'qr_not_available','QR so‘rovi yoki ish vaqti o‘zgargan. Yangilang.');
    entryId=joined.rows[0].id;
    await c.query(`INSERT INTO walkin_queue_events(entry_id,actor_user_id,action)
      VALUES($1,$2,'joined')`,[entryId,actor.userId]);
   }
   // Condition the FINAL write on live expiry. If the 30-minute boundary
   // passed while schedule/queue operations ran, rollback their inserts too.
   const finalized=await c.query(`UPDATE walkin_qr_requests SET status=$1,queue_entry_id=$2,
     decided_by_user_id=$3,decided_at=clock_timestamp()
     WHERE id=$4 AND status='pending'
       AND created_at>clock_timestamp()-interval '30 minutes'
       AND (created_at AT TIME ZONE 'Asia/Tashkent')::date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
       AND ($5='rejected' OR EXISTS (
         SELECT 1 FROM ustara_effective_day_schedule($6,
           (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date) s
         WHERE (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::time>=s.start_time
           AND (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::time<s.end_time
       )) RETURNING id`,
    [final,entryId,actor.userId,id,final,actor.barberId]);
   if(finalized.rowCount!==1){
    // The request row is locked: only its deadline or the shop's open
    // interval can have changed. Distinguish a closed shop from expiry.
    const live=await c.query(`SELECT (created_at>clock_timestamp()-interval '30 minutes' AND
      (created_at AT TIME ZONE 'Asia/Tashkent')::date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date)
      AS pending_live FROM walkin_qr_requests WHERE id=$1`,[id]);
    if(live.rows[0]?.pending_live===true && final==='approved')
     throw fail(409,'barber_closed','Ish vaqti tugagan. So‘rovni tasdiqlab bo‘lmaydi.');
    throw fail(410,'request_expired','QR so‘rovining vaqti tugagan.');
   }
   await c.query(`INSERT INTO walkin_qr_request_events(request_id,actor_user_id,action)
       VALUES($1,$2,$3)`,[id,actor.userId,final]);
   return {body:{status:final,queue_entry_id:entryId,replayed:false}};
  });
 }
 return {tokenCreate,requestJoin,requestStatus,pendingList,decide};
}
module.exports={createHandlers,isKey,isToken,tokenHash,requestHash,publicOrigin};
