'use strict';
const pool = require('../db');
const { validDate } = require('../utils/bookingTime');
const { invalidActiveBooking } = require('../services/calendarSchedule');
const {scheduleActor,lockScheduleOwner,ensureCurrentDay,mutationFailure,readScheduleSnapshot,scheduleReadFailure,isBrokenScheduleConnection}=require('../services/barberScheduleWriteGuard');
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const stepTime=value=>typeof value==='string' && HHMM.test(value) && Number(value.slice(3))%5===0;
function problem(status,message,code){ return {status,message,code}; }
function validateException(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || !validDate(input.date))
    throw problem(400,'Sanani YYYY-MM-DD formatida kiriting.','invalid_date');
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  // Do not let historic overrides change the appearance of a completed service.
  if(input.date < today) throw problem(400,'O‘tgan kunga o‘zgartirish kiritib bo‘lmaydi.','past_date');
  if(typeof input.is_closed!=='boolean') throw problem(400,'Dam olish holatini tanlang.','invalid_calendar');
  if(input.is_closed) {
    if ([input.start_time,input.end_time,input.break_start,input.break_end].some(x=>x!==undefined && x!==null && x!==''))
      throw problem(400,'Dam olish kuniga ish vaqti yoki tanaffus kiritilmaydi.','invalid_calendar');
    return {date:input.date,is_closed:true,start_time:null,end_time:null,break_start:null,break_end:null};
  }
  const start=input.start_time,end=input.end_time;
  if(!stepTime(start)||!stepTime(end)||start>=end)
    throw problem(400,'Ish vaqti HH:MM formatida va to‘g‘ri ketma-ketlikda bo‘lishi kerak.','invalid_calendar');
  const a=input.break_start || null,b=input.break_end || null;
  if ((a!==null || b!==null) && (!stepTime(a) || !stepTime(b) || a<start || a>=b || b>end))
    throw problem(400,'Tanaffus ish vaqtining ichida bo‘lishi kerak.','invalid_break');
  return {date:input.date,is_closed:false,start_time:start,end_time:end,break_start:a,break_end:b};
}
function createHandlers(database=pool){
  async function list(req,res){
    res.set('Cache-Control','no-store');
    let actor;try{actor=scheduleActor(req.user);}catch(e){return scheduleReadFailure(res,e,'calendar list');}
    try{
      const rows=await readScheduleSnapshot(database,actor,client=>client.query(`SELECT local_date::text AS date,is_closed,
        to_char(start_time,'HH24:MI') AS start_time,to_char(end_time,'HH24:MI') AS end_time,
        to_char(break_start,'HH24:MI') AS break_start,to_char(break_end,'HH24:MI') AS break_end
        FROM barber_calendar_exceptions
        WHERE barber_id=$1 AND local_date >= (transaction_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
        ORDER BY local_date LIMIT 500`,[actor.barberId]));
      res.set('Cache-Control','no-store');return res.json(rows.rows);
    }catch(error){return scheduleReadFailure(res,error,'calendar list');}
  }
  async function save(req,res){
    res.set('Cache-Control','no-store');
    if(req.user?.role!=='barber')return res.status(403).json({message:'Faqat sartarosh uchun.'});
    let items;
    try{
      if(!Array.isArray(req.body?.dates) || req.body.dates.length===0 || req.body.dates.length>90)
        throw problem(400,'Bir amalda 1 dan 90 tagacha sanani tanlang.','invalid_calendar');
      items=req.body.dates.map(validateException);
      if(new Set(items.map(x=>x.date)).size!==items.length)throw problem(400,'Sana takrorlangan.','duplicate_date');
    }catch(e){return res.status(e.status||400).json({message:e.message,code:e.code||'invalid_calendar'});}
    let actor;try{actor=scheduleActor(req.user);}catch(e){return res.status(e.status).json({message:e.message,code:e.code});}
    const barberId=actor.barberId;
    let client,transaction=false,broken=false,commitStarted=false;
    try{
      client=await database.connect();await client.query('BEGIN');transaction=true;
      await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='15s'");
      await lockScheduleOwner(client,actor);
      await ensureCurrentDay(client,items.map(x=>x.date));
      for(const x of items){
        await client.query(`INSERT INTO barber_calendar_exceptions
          (barber_id,local_date,is_closed,start_time,end_time,break_start,break_end)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT(barber_id,local_date) DO UPDATE SET is_closed=EXCLUDED.is_closed,
          start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,
          break_start=EXCLUDED.break_start,break_end=EXCLUDED.break_end,
          updated_at=clock_timestamp()`,[barberId,x.date,x.is_closed,x.start_time,x.end_time,x.break_start,x.break_end]);
      }
      const conflict=await invalidActiveBooking(client,barberId,items.map(x=>x.date));
      if(conflict!==null)throw problem(409,'Bu sanada tasdiqlangan bron bor. Avval mijoz bilan kelishib vaqtini ko‘chiring. Eski kalendar saqlandi.','existing_booking_conflict');
      // v111: a large batch can cross midnight while writing its rows.
      // Abort the entire edit if any selected date became historical before COMMIT.
      await ensureCurrentDay(client,items.map(x=>x.date));
      commitStarted=true;await client.query('COMMIT');transaction=false;commitStarted=false;
      res.set('Cache-Control','no-store');return res.json({message:'Kalendar saqlandi.',saved:items.length});
    }catch(error){
      if(isBrokenScheduleConnection(error))broken=true;
      if(commitStarted){broken=true;error.commitUncertain=true;}
      else if(client&&transaction){try{await client.query('ROLLBACK');}catch{broken=true;}}
      return mutationFailure(res,error,'calendar save');
    }finally{if(client)client.release(broken);}
  }
  async function remove(req,res){
    res.set('Cache-Control','no-store');
    if(req.user?.role!=='barber')return res.status(403).json({message:'Faqat sartarosh uchun.'});
    if(!validDate(req.params.date))return res.status(400).json({message:'Sana noto‘g‘ri.'});
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if(req.params.date<today)return res.status(400).json({message:'O‘tgan sanadagi kalendarni o‘zgartirib bo‘lmaydi.'});
    let actor;try{actor=scheduleActor(req.user);}catch(e){return res.status(e.status).json({message:e.message,code:e.code});}
    const barberId=actor.barberId;
    let client,transaction=false,broken=false,commitStarted=false;
    try{
      client=await database.connect();await client.query('BEGIN');transaction=true;
      await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='15s'");
      await lockScheduleOwner(client,actor);
      await ensureCurrentDay(client,[req.params.date]);
      await client.query('DELETE FROM barber_calendar_exceptions WHERE barber_id=$1 AND local_date=$2::date',[barberId,req.params.date]);
      // Removing an exception may restore shorter weekly hours or a day off.
      const conflict=await invalidActiveBooking(client,barberId,[req.params.date]);
      if(conflict!==null)throw problem(409,'Istisnoni o‘chirib bo‘lmaydi: mavjud bron haftalik jadvalga sig‘maydi.','existing_booking_conflict');
      await ensureCurrentDay(client,[req.params.date]);
      commitStarted=true;await client.query('COMMIT');transaction=false;commitStarted=false;
      res.set('Cache-Control','no-store');return res.json({message:'Kalendar istisnosi olib tashlandi.'});
    }catch(e){
      if(isBrokenScheduleConnection(e))broken=true;
      if(commitStarted){broken=true;e.commitUncertain=true;}
      else if(client&&transaction)try{await client.query('ROLLBACK');}catch{broken=true;}
      return mutationFailure(res,e,'calendar remove');
    }finally{if(client)client.release(broken);}
  }
  return {list,save,remove};
}
module.exports={createHandlers,validateException};
