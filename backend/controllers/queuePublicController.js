'use strict';
const pool=require('../db');
// statement_timestamp() is stable within one SQL statement (including midnight rollover).
const {estimateWait,typicalMinutes}=require('../services/queueLiveEstimate');
const safeId=value=>{
 if(typeof value!=='string'||!(/^[1-9]\d{0,9}$/).test(value))return null;
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>0&&n<=2147483647?n:null;
};
// Database corruption must not become a misleading zero-minute queue estimate.
const validQueueCount=value=>{
 if(typeof value!=='number'&&typeof value!=='string')return null;
 if(!/^(0|[1-9]\d*)$/.test(String(value)))return null;
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>=0&&n<=2147483647?n:null;
};
function createPublicSummary(db=pool){
 return async (req,res)=>{
  const barberId=safeId(req.params?.barberId);
  res.set('Cache-Control','no-store');
  if(!barberId)return res.status(400).json({code:'invalid_barber_id',message:'Sartarosh ID noto‘g‘ri.'});
  try{
   const result=await db.query(`SELECT b.id,statement_timestamp() AS as_of,
      (SELECT count(*)::int FROM walkin_queue q WHERE q.barber_id=b.id
       AND q.queue_date=(statement_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
       AND q.status='waiting') AS waiting_count,
      EXISTS(SELECT 1 FROM barber_day_closures dc WHERE dc.barber_id=b.id
       AND dc.local_date=(statement_timestamp() AT TIME ZONE 'Asia/Tashkent')::date AND dc.is_closed) AS day_closed,
      EXISTS(SELECT 1 FROM walkin_queue q WHERE q.barber_id=b.id
       AND q.queue_date=(statement_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
       AND q.status IN ('called','arrived','in_service')) AS has_called,
      (SELECT COALESCE(ROUND(AVG(s.duration_minutes)/5)*5,20)::int FROM services s
       WHERE s.barber_id=b.id AND s.duration_minutes>0
       AND COALESCE((to_jsonb(s)->>'is_active')::boolean,TRUE)) AS typical_minutes
    FROM barbers b JOIN users u ON u.id=b.user_id
    WHERE b.id=$1 AND b.verification_status='approved'
       AND u.role='barber' AND u.deactivated_at IS NULL`,[barberId]);
   if(!result.rowCount)return res.status(404).json({code:'not_found',message:'Sartarosh topilmadi.'});
   const x=result.rows[0],waiting=validQueueCount(x.waiting_count);
   if(waiting===null||typeof x.has_called!=='boolean'||typeof x.day_closed!=='boolean'
     || !(x.as_of instanceof Date || (typeof x.as_of==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(x.as_of)))
     || !Number.isFinite(new Date(x.as_of).getTime()))
     return res.status(503).json({code:'queue_unavailable',message:'Navbat ma’lumoti vaqtincha ishlamayapti.'});
   const hasCalled=x.has_called;
   return res.json({barber_id:barberId,waiting_count:waiting,currently_called:hasCalled,day_closed:x.day_closed,
     new_arrival_estimate:x.day_closed?null:estimateWait(waiting+1,hasCalled,typicalMinutes(x.typical_minutes)),
     estimate_note:x.day_closed?'Bugun yangi navbat qabul qilinmaydi.':'Taxminiy: xizmat davomiyligi va oldindan tasdiqlangan bronlar hisobga to‘liq olinmagan.',
     as_of:new Date(x.as_of).toISOString()});
  }catch(e){console.error('queue public summary',e.code||'error');
   return res.status(503).json({code:'queue_unavailable',message:'Navbat ma’lumoti vaqtincha ishlamayapti.'});}
 };
}
module.exports={createPublicSummary};
