'use strict';
const pool=require('../db');
const {validDate}=require('../utils/bookingTime');
const {invalidActiveBooking}=require('../services/calendarSchedule');
const {scheduleActor,lockScheduleOwner,ensureCurrentDay,mutationFailure,readScheduleSnapshot,scheduleReadFailure,isBrokenScheduleConnection}=require('../services/barberScheduleWriteGuard');
const TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
const err=(status,message,code)=>({status,message,code});
function validateIntervals(input){
  if(!Array.isArray(input)||input.length>8)throw err(400,'Bir kunda ko‘pi bilan 8 ta tanaffus kiriting.','invalid_breaks');
  const result=input.map(item=>{
    if(!item || typeof item!=='object' || !TIME.test(item.start||'') || !TIME.test(item.end||'')
      || item.start>=item.end || Number(item.start.slice(3))%5!==0 || Number(item.end.slice(3))%5!==0)
      throw err(400,'Tanaffuslar HH:MM formatida va 5 daqiqalik qadamda bo‘lishi kerak.','invalid_break');
    return {start:item.start,end:item.end};
  }).sort((a,b)=>a.start.localeCompare(b.start));
  for(let i=1;i<result.length;i++){
    if(result[i-1].end>result[i].start)throw err(400,'Tanaffuslar ustma-ust tushmasligi kerak.','break_overlap');
  }
  return result;
}
function localToday(){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
function createHandlers(database=pool){
  async function list(req,res){
    res.set('Cache-Control','no-store');
    let actor;try{actor=scheduleActor(req.user);}catch(e){return scheduleReadFailure(res,e,'break rules list');}
    try{
      const {weekly,dated}=await readScheduleSnapshot(database,actor,async client=>{
        // Both lists share a single repeatable-read snapshot: no mixed old/new rules.
        const weekly=await client.query(`SELECT day_of_week, to_char(start_time,'HH24:MI') AS start,
          to_char(end_time,'HH24:MI') AS "end" FROM barber_weekly_breaks
          WHERE barber_id=$1 ORDER BY day_of_week,start_time`,[actor.barberId]);
        const dated=await client.query(`SELECT local_date::text AS date, to_char(start_time,'HH24:MI') AS start,
          to_char(end_time,'HH24:MI') AS "end" FROM barber_date_breaks
          WHERE barber_id=$1 AND local_date >= (transaction_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
          ORDER BY local_date,start_time LIMIT 800`,[actor.barberId]);
        return {weekly:weekly.rows,dated:dated.rows};
      });
      res.set('Cache-Control','no-store');return res.json({weekly,dated});
    }catch(e){return scheduleReadFailure(res,e,'break rules list');}
  }
  async function update(req,res,kind){
    res.set('Cache-Control','no-store');
    if(req.user?.role!=='barber')return res.status(403).json({message:'Faqat sartarosh uchun.'});
    let actor;try{actor=scheduleActor(req.user);}catch(e){return res.status(e.status).json({message:e.message,code:e.code});}
    const id=actor.barberId;
    let breaks,day,date;
    try{
      breaks=validateIntervals(req.body?.breaks);
      if(kind==='weekly'){
        day=req.body?.day_of_week;
        if(!Number.isInteger(day)||day<0||day>6)throw err(400,'Hafta kunini tanlang.','invalid_day');
      }else{
        date=req.body?.date;
        if(!validDate(date)||date<localToday())throw err(400,'Kelajakdagi haqiqiy sanani tanlang.','invalid_date');
      }
    }catch(e){return res.status(e.status||400).json({message:e.message,code:e.code||'invalid_breaks'});}
    let client,inTx=false,broken=false,commitStarted=false;
    try{
      client=await database.connect();await client.query('BEGIN');inTx=true;
      await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='15s'");
      // Match QR/queue/day-close: lock the active account and its profile
      // BEFORE the per-barber advisory mutex, even for an empty break list.
      await lockScheduleOwner(client,actor);
      if(kind==='dated')await ensureCurrentDay(client,[date]);
      if(kind==='weekly'){
        await client.query('DELETE FROM barber_weekly_breaks WHERE barber_id=$1 AND day_of_week=$2',[id,day]);
        for(const b of breaks)await client.query('INSERT INTO barber_weekly_breaks (barber_id,day_of_week,start_time,end_time) VALUES ($1,$2,$3,$4)',[id,day,b.start,b.end]);
      }else{
        await client.query('DELETE FROM barber_date_breaks WHERE barber_id=$1 AND local_date=$2::date',[id,date]);
        for(const b of breaks)await client.query('INSERT INTO barber_date_breaks (barber_id,local_date,start_time,end_time) VALUES ($1,$2,$3,$4)',[id,date,b.start,b.end]);
      }
      // weekly edit affects *every* future matching weekday, not just this week.
      // Checking ALL active future bookings catches any newly invalid appointment.
      const conflict=await invalidActiveBooking(client,id,kind==='weekly'?null:[date]);
      if(conflict!==null)throw err(409,'Yangi tanaffus mavjud bron bilan to‘qnashdi. Avval bronni kelishib ko‘chiring. Eski qoida saqlandi.','existing_booking_conflict');
      if(kind==='dated')await ensureCurrentDay(client,[date]);
      commitStarted=true;await client.query('COMMIT');inTx=false;commitStarted=false;
      res.set('Cache-Control','no-store');return res.json({message:'Tanaffuslar saqlandi.',saved:breaks.length});
    }catch(e){
      if(isBrokenScheduleConnection(e))broken=true;
      if(commitStarted){broken=true;e.commitUncertain=true;}
      else if(client&&inTx)try{await client.query('ROLLBACK');}catch{broken=true;}
      return mutationFailure(res,e,'break rule update');
    }finally{if(client)client.release(broken);}
  }
  return {list,weekly:(req,res)=>update(req,res,'weekly'),dated:(req,res)=>update(req,res,'dated')};
}
module.exports={createHandlers,validateIntervals};
