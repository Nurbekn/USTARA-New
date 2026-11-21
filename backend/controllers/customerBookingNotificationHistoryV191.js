'use strict';
// Read-only, account-scoped record of server-side Telegram API attempts.
// "accepted" is NEVER a delivery/read receipt.
function createHandler(database){
 return async function history(req,res){
  res.set('Cache-Control','no-store');
  if(req.user?.role!=='customer'||!Number.isSafeInteger(req.user.id)||req.user.id<=0||req.user.id>2147483647)
    return res.status(403).json({code:'customer_required'});
  try{
   const result=await database.query(`SELECT n.id,n.booking_id,n.event_kind,n.status,n.created_at
     FROM customer_booking_telegram_outbox n
     JOIN users u ON u.id=n.user_id AND u.role='customer'
     WHERE n.user_id=$1 AND u.admin_suspended_at IS NULL AND u.deactivated_at IS NULL
     ORDER BY n.id DESC LIMIT 20`,[req.user.id]);
   return res.json({notices:result.rows.map(r=>({
    id:String(r.id),bookingId:r.booking_id,event:r.event_kind,
    status:r.status,createdAt:r.created_at
   }))});
  }catch{
   return res.status(503).json({code:'notification_history_unavailable'});
  }
 };
}
const history=(req,res)=>createHandler(require('../db'))(req,res);
module.exports={createHandler,history};
