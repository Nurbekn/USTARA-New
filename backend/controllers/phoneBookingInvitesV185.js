'use strict';
// v185 / #160, #176: phone-assisted booking invitations, NOT bookings.
// A barber cannot impersonate a customer: the customer must log in and confirm
// through the existing, race-safe POST /api/bookings booking/quote protocol.
const crypto = require('node:crypto');
const { parseBookingTime } = require('../utils/bookingTime');
const MAX_ID = 2147483647;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const MAX_AHEAD_MS = 14 * 24 * 60 * 60000;
const validId = v => Number.isSafeInteger(v) && v > 0 && v <= MAX_ID;
const routeId = v => typeof v === 'string' && /^[1-9]\d*$/.test(v) && validId(Number(v)) ? Number(v) : null;
const isBarber = u => u?.role === 'barber' && validId(u.profileId);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const guardResponse = res => {
  res.set?.('Cache-Control','no-store');
  res.set?.('X-Robots-Tag','noindex, nofollow');
  res.set?.('Referrer-Policy','no-referrer');
};
const invalid = (res,code,message) => res.status(400).json({code,message});
const unauthorised = res => res.status(403).json({code:'forbidden',message:'Faqat sartarosh o‘z telefon taklifini boshqaradi.'});
const failure = (res,code='phone_invite_unavailable') => res.status(503).json({code,message:'Telefon bron taklifi holatini tekshirib bo‘lmadi.'});
function checkCreateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 2 || !Object.hasOwn(body,'serviceId') || !Object.hasOwn(body,'bookingTime') ||
      !validId(body.serviceId) || typeof body.bookingTime !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:00\+05:00$/.test(body.bookingTime)) return null;
  const ms = parseBookingTime(body.bookingTime);
  if (!Number.isFinite(ms) || ms % 300000 !== 0) return null;
  return {serviceId:body.serviceId,bookingTime:new Date(ms).toISOString(),timestamp:ms};
}
function createHandler({connect}) {
 return async (req,res) => {
  guardResponse(res);
  if (!isBarber(req.user)) return unauthorised(res);
  const body=checkCreateBody(req.body);
  if (!body) return invalid(res,'invalid_invite','Xizmat va Toshkent vaqtidagi 5 daqiqalik vaqtni tanlang.');
  let db, started=false, commitStarted=false, broken=false;
  try {
    db=await connect();
    await db.query('BEGIN'); started=true;
    await db.query("SET LOCAL statement_timeout='15s'");
    const barber=await db.query(`SELECT b.id,b.verification_status,b.accepting_bookings,clock_timestamp() AS now
      FROM barbers b JOIN users u ON u.id=b.user_id AND u.role='barber' AND u.deactivated_at IS NULL
      WHERE b.id=$1 FOR UPDATE OF b`,[req.user.profileId]);
    if (!barber.rowCount || barber.rows[0].verification_status!=='approved' || barber.rows[0].accepting_bookings!==true) {
      await db.query('ROLLBACK');started=false;
      return res.status(409).json({code:'barber_unavailable',message:'Tasdiqlangan faol sartarosh kerak.'});
    }
    const now=+new Date(barber.rows[0].now);
    if (!Number.isFinite(now) || body.timestamp <= now || body.timestamp > now + MAX_AHEAD_MS) {
      await db.query('ROLLBACK');started=false;
      return res.status(409).json({code:'invalid_time_window',message:'Kelgusi 14 kun ichidagi vaqtni tanlang.'});
    }
    const service=await db.query(`SELECT id FROM services WHERE id=$1 AND barber_id=$2
      AND COALESCE((to_jsonb(services)->>'is_active')::boolean,TRUE) FOR SHARE`,[body.serviceId,req.user.profileId]);
    if (!service.rowCount) {await db.query('ROLLBACK');started=false;
      return res.status(404).json({code:'service_unavailable',message:'Xizmat topilmadi yoki faol emas.'});}
    // The barber profile row lock serializes per-barber rate checks.
    const rate=await db.query(`SELECT count(*)::integer AS n FROM barber_phone_booking_invites
      WHERE barber_id=$1 AND created_at>clock_timestamp()-INTERVAL '1 hour'`,[req.user.profileId]);
    if (Number(rate.rows[0]?.n)>=10) {await db.query('ROLLBACK');started=false;
      return res.status(429).json({code:'invite_limit',message:'Bir soatda ko‘pi bilan 10 ta havola yarating.'});}
    const token=crypto.randomBytes(32).toString('base64url');
    const created=await db.query(`INSERT INTO barber_phone_booking_invites
      (barber_id,service_id,booking_time,token_digest) VALUES($1,$2,$3,$4)
      RETURNING id,expires_at`,[req.user.profileId,body.serviceId,body.bookingTime,digest(token)]);
    if (created.rowCount!==1) throw Error('invite_not_created');
    commitStarted=true;await db.query('COMMIT');started=false;commitStarted=false;
    return res.status(201).json({id:created.rows[0].id,token,expiresAt:new Date(created.rows[0].expires_at).toISOString(),
      note:'Bu faqat taklif havolasi. Slot band qilinmagan. Bron faqat mijoz tasdiqlagandan keyin yaratiladi.'});
  } catch(error) {
    if (commitStarted) broken=true;
    if (started && !commitStarted) {try {await db.query('ROLLBACK');}catch{broken=true;}}
    console.error('Phone invite creation failed',{code:error.code||'unavailable'});
    return failure(res,'invite_creation_unknown');
  } finally {db?.release(broken);}
 };
}
function readHandler({query}) {
 return async (req,res) => {
  guardResponse(res);
  const token=req.params?.token;
  if (typeof token!=='string' || !TOKEN_RE.test(token)) return res.status(404).json({code:'not_found',message:'Taklif topilmadi.'});
  try {
    const found=await query(`SELECT i.barber_id,i.service_id,i.booking_time,i.expires_at,
      s.name AS service_name,s.price,s.duration_minutes,
      b.first_name AS barber_first_name,b.last_name AS barber_last_name
      FROM barber_phone_booking_invites i
      JOIN barbers b ON b.id=i.barber_id AND b.verification_status='approved' AND b.accepting_bookings=TRUE
      JOIN users u ON u.id=b.user_id AND u.role='barber' AND u.deactivated_at IS NULL
      JOIN services s ON s.id=i.service_id AND s.barber_id=b.id
        AND COALESCE((to_jsonb(s)->>'is_active')::boolean,TRUE)
      WHERE i.token_digest=$1 AND i.revoked_at IS NULL AND i.expires_at>clock_timestamp()
        AND i.booking_time>clock_timestamp()`,[digest(token)]);
    if (found.rowCount!==1) return res.status(410).json({code:'invite_unavailable',message:'Taklif muddati tugagan yoki bekor qilingan.'});
    const row=found.rows[0];
    return res.status(200).json({barberId:row.barber_id,serviceId:row.service_id,
      bookingTime:new Date(row.booking_time).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),
      barberName:[row.barber_first_name,row.barber_last_name].filter(Boolean).join(' '),
      serviceName:row.service_name,price:String(row.price),durationMinutes:Number(row.duration_minutes),
      note:'Taklif slotni band qilmaydi. Narx va bo‘sh vaqt bronni tasdiqlashdan oldin serverda yangidan tekshiriladi.'});
  } catch(error) {console.error('Phone invite lookup failed',{code:error.code||'unavailable'});return failure(res);}
 };
}
function listHandler({query}) {
 return async(req,res)=>{
  guardResponse(res); if(!isBarber(req.user))return unauthorised(res);
  try {
    const result=await query(`SELECT id,service_id,booking_time,created_at,expires_at,
      CASE WHEN revoked_at IS NOT NULL THEN 'revoked'
        WHEN expires_at<=clock_timestamp() OR booking_time<=clock_timestamp() THEN 'expired'
        ELSE 'active' END AS state
      FROM barber_phone_booking_invites WHERE barber_id=$1 ORDER BY id DESC LIMIT 20`,[req.user.profileId]);
    return res.status(200).json({items:result.rows});
  }catch(error){console.error('Phone invite list failed',{code:error.code||'unavailable'});return failure(res);}
 };
}
function revokeHandler({query}) {
 return async(req,res)=>{
  guardResponse(res);if(!isBarber(req.user))return unauthorised(res);
  const id=routeId(req.params?.id);
  if(!id)return invalid(res,'invalid_id','Taklif ID noto‘g‘ri.');
  try {
    const result=await query(`UPDATE barber_phone_booking_invites SET revoked_at=clock_timestamp()
      WHERE id=$1 AND barber_id=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp()
      RETURNING id`,[id,req.user.profileId]);
    if(!result.rowCount)return res.status(409).json({code:'invite_not_active',message:'Taklif faol emas yoki sizga tegishli emas.'});
    return res.status(200).json({revoked:true,id});
  }catch(error){console.error('Phone invite revoke failed',{code:error.code||'unavailable'});return failure(res,'invite_revoke_unknown');}
 };
}
module.exports={createHandler,readHandler,listHandler,revokeHandler,checkCreateBody,TOKEN_RE,digest};
