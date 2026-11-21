'use strict';
// Explicit, single-shot operator Telegram notices. Never assumes delivery/read receipts.
const {caseIdOf}=require('./adminSuspensionCasesV188');

function noticeIntent(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
  !Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||
  Object.keys(body).some(k=>k!=='expectedRevision'))return null;
 return {expectedRevision:body.expectedRevision};
}

function createHandlers(pool){
 if(!pool?.connect)throw new TypeError('PostgreSQL pool required');
 return {async request(req,res){
  res.set('Cache-Control','no-store');
  if(req.user?.role!=='admin'||!Number.isSafeInteger(req.user.id))
   return res.status(403).json({code:'admin_required'});
  const id=caseIdOf(req.params?.id),intent=noticeIntent(req.body);
  if(!id||!intent)return res.status(400).json({code:'invalid_notice_request'});
  const client=await pool.connect().catch(()=>null);
  if(!client)return res.status(503).json({code:'notice_state_unknown'});
  let broken=false;
  try{
   await client.query('BEGIN');
   await client.query("SET LOCAL lock_timeout='5s'");
   await client.query("SET LOCAL statement_timeout='15s'");
   const admin=await client.query('SELECT id FROM admin_accounts WHERE id=$1 AND is_active=TRUE FOR SHARE',[req.user.id]);
   if(!admin.rowCount){await client.query('ROLLBACK');return res.status(403).json({code:'admin_inactive'});}
   const result=await client.query(`SELECT c.id,c.revision,c.status,e.user_id,b.id AS booking_id,
     b.status AS booking_status,(b.booking_time+b.duration_minutes*INTERVAL '1 minute'>clock_timestamp()) AS booking_future,
     u.role AS suspended_role,u.admin_suspended_at,
     p.admin_suspended_at AS barber_suspended_at,p.deactivated_at AS barber_deactivated_at,
     (l.chat_id IS NOT NULL) AS barber_linked
     FROM admin_suspension_booking_cases c
     JOIN admin_account_suspension_events e ON e.id=c.suspension_event_id
     JOIN users u ON u.id=e.user_id
     JOIN bookings b ON b.id=c.booking_id
     JOIN barbers r ON r.id=b.barber_id
     JOIN users p ON p.id=r.user_id AND p.role='barber'
     LEFT JOIN barber_telegram_links l ON l.barber_id=r.id
     WHERE c.id=$1 FOR UPDATE OF c`,[id]);
   if(!result.rowCount){await client.query('ROLLBACK');return res.status(404).json({code:'case_not_found'});}
   const row=result.rows[0];
   if(row.revision!==intent.expectedRevision||!['reviewed','attempted'].includes(row.status)){
    await client.query('ROLLBACK');return res.status(409).json({code:'case_state_changed'});
   }
   // Customer suspension only: the unaffected barber has opted into Telegram via /link.
   // No verified persistent customer Telegram identity exists in this project.
   const allowed=row.suspended_role==='customer' && row.admin_suspended_at!=null &&
     row.barber_suspended_at==null && row.barber_deactivated_at==null && row.barber_linked===true &&
     row.booking_future===true && ['pending','confirmed'].includes(row.booking_status);
   if(!allowed){await client.query('ROLLBACK');return res.status(409).json({code:'telegram_contact_unavailable'});}
   const inserted=await client.query(`INSERT INTO admin_suspension_telegram_notices
       (case_id,requested_by,status) VALUES($1,$2,'queued') ON CONFLICT(case_id) DO NOTHING RETURNING id,status`,[id,req.user.id]);
   if(!inserted.rowCount){await client.query('ROLLBACK');return res.status(409).json({code:'notice_already_requested'});}
   await client.query('COMMIT');
   return res.status(202).json({caseId:id,noticeStatus:'queued',notificationsSent:false,bookingsChanged:false});
  }catch{
   try{await client.query('ROLLBACK');}catch{broken=true;}
   return res.status(503).json({code:'notice_state_unknown',message:'Natija nomaʼlum. Yana yuborishdan oldin ro‘yxatni yangilang.'});
  }finally{client.release(broken);}
 }};
}
module.exports={noticeIntent,createHandlers};
