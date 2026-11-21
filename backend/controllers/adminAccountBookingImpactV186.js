'use strict';
// #177 groundwork: Admin can inspect unfinished visits before account removal.
// Preview is strictly read-only and NOT authorization for a later DELETE.
const INT_MAX=2147483647;
function parseTarget(params={}){
  const role=params.role;
  const raw=params.id;
  if(!['customer','barber'].includes(role)||typeof raw!=='string'||!/^[1-9]\d{0,9}$/.test(raw))return null;
  const id=Number(raw);
  return Number.isSafeInteger(id)&&id<=INT_MAX?{role,id}:null;
}
function createHandlers(db){
  return {async impact(req,res){
    res.set('Cache-Control','no-store');
    if(req.user?.role!=='admin')return res.status(403).json({code:'admin_required'});
    const target=parseTarget(req.params);
    if(!target)return res.status(400).json({code:'invalid_target'});
    const table=target.role==='customer'?'customers':'barbers';
    const fk=target.role==='customer'?'customer_id':'barber_id';
    try{
      const owner=await db.query(`SELECT p.id FROM ${table} p JOIN users u ON u.id=p.user_id
        WHERE p.id=$1 AND u.role=$2`,[target.id,target.role]);
      if(!owner.rowCount)return res.status(404).json({code:'account_not_found'});
      const state=await db.query(`SELECT count(*)::int AS active_count,
          min(booking_time) AS earliest_booking_time
        FROM bookings WHERE ${fk}=$1 AND status IN ('pending','confirmed')
          AND booking_time + duration_minutes * INTERVAL '1 minute' > clock_timestamp()`,[target.id]);
      const activeCount=Number(state.rows[0]?.active_count);
      if(!Number.isSafeInteger(activeCount)||activeCount<0)return res.status(503).json({code:'impact_unavailable'});
      return res.json({role:target.role,profileId:target.id,readOnly:true,
        activeCount,hasUnfinishedBookings:activeCount>0,
        earliestBookingTime:state.rows[0]?.earliest_booking_time??null});
    }catch{
      return res.status(503).json({code:'impact_unavailable',message:'Bron holatini hozir tekshirib bo‘lmadi.'});
    }
  }};
}
module.exports={parseTarget,createHandlers};
