'use strict';
// v111: schedule edits share a transaction-lock order with queue/QR/day-close.
// A signed-in barber profile is not sufficient: bind it to the actual active
// user before acquiring the per-barber advisory mutex.
const safeId=value=>{
 const n=typeof value==='string'&&/^[1-9]\d*$/.test(value)?Number(value):value;
 return Number.isSafeInteger(n)&&n>0&&n<=2147483647?n:null;
};
const problem=(status,code,message)=>Object.assign(new Error(message),{status,code});
// Shared connection classification for calendar, booking, queue and QR.
const {isPgConnectionBroken}=require('../utils/pgConnectionHealth');
const isBrokenScheduleConnection=isPgConnectionBroken;
function scheduleActor(user){
 if(user?.role!=='barber')throw problem(403,'forbidden','Faqat sartarosh uchun.');
 const barberId=safeId(user.profileId),userId=safeId(user.id);
 if(!barberId||!userId)throw problem(401,'invalid_session','Sartarosh sessiyasi noto‘g‘ri.');
 return {barberId,userId};
}
async function lockScheduleOwner(client,{barberId,userId}){
 const verified=await client.query(`SELECT b.id FROM barbers b JOIN users u ON u.id=b.user_id
   WHERE b.id=$1 AND b.user_id=$2 AND b.verification_status='approved'
     AND u.role='barber' AND u.deactivated_at IS NULL
   FOR SHARE OF b,u`,[barberId,userId]);
 if(verified.rowCount!==1)throw problem(403,'barber_unavailable','Faol tasdiqlangan sartarosh hisobi kerak.');
 await client.query('SELECT pg_advisory_xact_lock($1)',[barberId]);
}
async function ensureCurrentDay(client,dates){
 const value=await client.query(`SELECT (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date::text AS today`);
 const today=value.rows?.[0]?.today;
 if(value.rowCount!==1||typeof today!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(today))
  throw problem(503,'calendar_unavailable','Database sanasini tekshirib bo‘lmadi.');
 if(dates.some(date=>date<today))
  throw problem(409,'calendar_day_changed','Kun almashgan. Kalendarni yangilab, qayta tekshiring.');
 return today;
}
function mutationFailure(res,e,area){
 res.set('Cache-Control','no-store');
 if(e.commitUncertain)return res.status(503).json({code:'calendar_result_unknown',
  message:'O‘zgarish natijasi noaniq. Avval kalendarni yangilang, avtomatik takrorlamang.'});
 if(e.status)return res.status(e.status).json({message:e.message,code:e.code});
 if(['55P03','57014','40P01','40001'].includes(e.code))return res.status(409).json({
  code:'calendar_busy',message:'Kalendar o‘zgaryapti. Yangilab, qayta urinib ko‘ring.'});
 console.error(area,e.code||'error');
 return res.status(503).json({code:'calendar_unavailable',message:'Kalendar vaqtincha saqlanmadi.'});
}
// v112: read calendar + dated/weekly breaks from a single authorized snapshot.
// A read-only REPEATABLE READ transaction takes no barber advisory mutex, so
// normal queue/QR and day-closing writes are not blocked by a calendar page.
// Authorization and both sets of data share one database snapshot: a revoked
// account cannot supply arbitrary profileId and read another barber's details.
async function readScheduleSnapshot(database,actor,read){
 let client,inTransaction=false,broken=false,commitStarted=false;
 try{
  client=await database.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');inTransaction=true;
  await client.query("SET LOCAL statement_timeout='10s'");
  const allowed=await client.query(`SELECT b.id FROM barbers b JOIN users u ON u.id=b.user_id
    WHERE b.id=$1 AND b.user_id=$2 AND b.verification_status='approved'
      AND u.role='barber' AND u.deactivated_at IS NULL`,[actor.barberId,actor.userId]);
  if(allowed.rowCount!==1)throw problem(403,'barber_unavailable','Faol tasdiqlangan sartarosh hisobi kerak.');
  const result=await read(client,actor.barberId);
  commitStarted=true;await client.query('COMMIT');inTransaction=false;commitStarted=false;
  return result;
 }catch(error){
  // An explicit transport error poisons the connection even if ROLLBACK is
  // acknowledged later. Pg SQLSTATE class 08 also means connection failure.
  if(isBrokenScheduleConnection(error))broken=true;
  if(commitStarted)broken=true; // Never reuse a connection with an uncertain COMMIT.
  else if(client&&inTransaction)try{await client.query('ROLLBACK');}catch{broken=true;}
  throw error;
 }finally{if(client)client.release(broken);}
}
function scheduleReadFailure(res,error,area){
 res.set('Cache-Control','no-store');
 if(error.status)return res.status(error.status).json({message:error.message,code:error.code});
 console.error(area,error.code||'error');
 return res.status(503).json({code:'calendar_unavailable',message:'Jadval vaqtincha yuklanmadi.'});
}
module.exports={scheduleActor,lockScheduleOwner,ensureCurrentDay,mutationFailure,readScheduleSnapshot,scheduleReadFailure,isBrokenScheduleConnection};
