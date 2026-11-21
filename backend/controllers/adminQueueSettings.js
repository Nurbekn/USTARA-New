'use strict';
const pool=require('../db');
const validMinutes=value=>typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=120;
function createHandlers(db=pool){
 const err=(res,e)=>{console.error('admin QR settings',e.code||'error');return res.status(503).json({code:'settings_unavailable',message:'QR sozlamasini yuklab bo‘lmadi.'});};
 async function get(req,res){
  if(req.user?.role!=='admin')return res.status(403).json({code:'forbidden',message:'Faqat Admin uchun.'});
  try{const q=await db.query('SELECT ttl_minutes,updated_at FROM walkin_qr_settings WHERE id=1');
   if(!q.rowCount)return res.status(503).json({code:'settings_unavailable',message:'QR sozlamasi topilmadi.'});
   res.set('Cache-Control','no-store');return res.json(q.rows[0]);
  }catch(e){return err(res,e);}
 }
 async function update(req,res){
  if(req.user?.role!=='admin')return res.status(403).json({code:'forbidden',message:'Faqat Admin uchun.'});
  const minutes=req.body?.ttl_minutes;
  if(!validMinutes(minutes))return res.status(400).json({code:'invalid_ttl',message:'QR muddati 1–120 daqiqa bo‘lishi kerak.'});
  if(!Number.isSafeInteger(Number(req.user?.id))||Number(req.user.id)<=0)
   return res.status(401).json({code:'invalid_session',message:'Admin sessiyasi noto‘g‘ri.'});
  let client,started=false,broken=false;
  try{
   client=await db.connect();await client.query('BEGIN');started=true;
   await client.query("SET LOCAL lock_timeout='5s'");
   const old=await client.query('SELECT ttl_minutes FROM walkin_qr_settings WHERE id=1 FOR UPDATE');
   if(!old.rowCount)throw Error('missing settings');
   const before=Number(old.rows[0].ttl_minutes);
   if(before!==minutes){
    await client.query(`UPDATE walkin_qr_settings SET ttl_minutes=$1,changed_by_user_id=$2,
      updated_at=clock_timestamp() WHERE id=1`,[minutes,Number(req.user.id)]);
    await client.query(`INSERT INTO walkin_qr_settings_events(actor_user_id,old_minutes,new_minutes)
      VALUES($1,$2,$3)`,[Number(req.user.id),before,minutes]);
   }
   await client.query('COMMIT');started=false;
   res.set('Cache-Control','no-store');return res.json({ttl_minutes:minutes,changed:before!==minutes});
  }catch(e){if(client&&started)try{await client.query('ROLLBACK');}catch{broken=true;}return err(res,e);}
  finally{if(client)client.release(broken);}
 }
 return {get,update};
}
module.exports={createHandlers,validMinutes};
