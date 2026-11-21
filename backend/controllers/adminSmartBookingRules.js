// v159: administrator-only, revision-checked global Smart Booking pause.
// This does not mutate the existing offers, bookings or Telegram outbox.
'use strict';
const validRevision=n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=1;
function createHandlers(db){
 db=db||require('../db');
 const forbidden=(res)=>res.status(403).json({code:'forbidden',message:'Faqat Admin uchun.'});
 const unavailable=(res,e)=>{console.error('smart booking admin rules',e?.code||'unavailable');
  return res.status(503).json({code:'smart_rules_unavailable',message:'Sozlamani tekshirib bo‘lmadi.'});};
 async function get(req,res){
  if(req.user?.role!=='admin')return forbidden(res);
  try{
   const q=await db.query('SELECT enabled,revision,updated_at FROM smart_booking_admin_settings WHERE id=1');
   if(q.rowCount!==1||typeof q.rows[0]?.enabled!=='boolean')return unavailable(res);
   res.set('Cache-Control','no-store');return res.json(q.rows[0]);
  }catch(e){return unavailable(res,e);}
 }
 async function update(req,res){
  if(req.user?.role!=='admin')return forbidden(res);
  if(typeof req.body?.enabled!=='boolean'||!validRevision(req.body?.expected_revision))
   return res.status(400).json({code:'invalid_policy',message:'enabled va expected_revision noto‘g‘ri.'});
  const adminId=Number(req.user.id);
  if(!Number.isSafeInteger(adminId)||adminId<1)return res.status(401).json({code:'invalid_session'});
  let c,started=false,broken=false;
  try{
   c=await db.connect();await c.query('BEGIN');started=true;
   await c.query("SET LOCAL lock_timeout='5s'");
   await c.query("SET LOCAL statement_timeout='15s'");
   const old=await c.query('SELECT enabled,revision FROM smart_booking_admin_settings WHERE id=1 FOR UPDATE');
   if(old.rowCount!==1||typeof old.rows[0]?.enabled!=='boolean')throw Error('missing policy');
   const current=old.rows[0];const revision=Number(current.revision);
   if(!Number.isSafeInteger(revision)||revision<1)throw Error('invalid policy revision');
   if(revision!==req.body.expected_revision){
    await c.query('ROLLBACK');started=false;
    res.set('Cache-Control','no-store');
    return res.status(409).json({code:'stale_policy',message:'Sozlama o‘zgargan. Avval yangilang.'});
   }
   let updated;
   if(current.enabled===req.body.enabled){
    updated={enabled:current.enabled,revision,changed:false};
   }else{
    const q=await c.query(`UPDATE smart_booking_admin_settings SET enabled=$1,revision=revision+1,
      changed_by_admin_id=$2,updated_at=clock_timestamp() WHERE id=1
      RETURNING enabled,revision,updated_at`,[req.body.enabled,adminId]);
    if(q.rowCount!==1)throw Error('policy update failed');
    await c.query(`INSERT INTO smart_booking_admin_settings_events
      (actor_admin_id,previous_enabled,next_enabled,previous_revision,next_revision)
      VALUES($1,$2,$3,$4,$5)`,[adminId,current.enabled,req.body.enabled,revision,revision+1]);
    updated={...q.rows[0],changed:true};
   }
   // Once COMMIT is attempted, a lost reply is NOT evidence to retry.
   try{await c.query('COMMIT');started=false;}
   catch(e){broken=true;throw e;}
   res.set('Cache-Control','no-store');return res.json(updated);
  }catch(e){if(c&&started&&!broken)try{await c.query('ROLLBACK');}catch{broken=true;}
   return unavailable(res,e);
  }finally{if(c)c.release(broken);}
 }
 return {get,update};
}
module.exports={createHandlers,validRevision};
