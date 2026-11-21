'use strict';
// #177 follow-up: suspension keeps bookings intact and revokes sessions.
// A stale Admin view cannot overwrite a newer suspension decision.
const MAX_ID = 2147483647;
function targetOf(params={}) {
  if (!['barber','customer'].includes(params.role) || typeof params.id!=='string' ||
      !/^[1-9]\d{0,9}$/.test(params.id)) return null;
  const id=Number(params.id);
  return Number.isSafeInteger(id) && id<=MAX_ID ? {role:params.role,id}:null;
}
function intentOf(body) {
  if (!body || typeof body!=='object' || Array.isArray(body) ||
      !['suspend','restore'].includes(body.action) || typeof body.expectedSuspended!=='boolean' ||
      typeof body.reason!=='string') return null;
  const reason=body.reason.trim();
  if (reason.length<5 || reason.length>300 || /[\u0000-\u001f\u007f]/.test(reason)) return null;
  if (body.expectedSuspended !== (body.action==='restore')) return null;
  return {action:body.action,expectedSuspended:body.expectedSuspended,reason};
}
function createHandlers(pool) {
  if (!pool?.connect) throw new TypeError('PostgreSQL pool required');
  return { async change(req,res) {
    res.set('Cache-Control','no-store');
    if (req.user?.role!=='admin' || !Number.isSafeInteger(req.user.id))
      return res.status(403).json({code:'admin_required'});
    const target=targetOf(req.params), intent=intentOf(req.body);
    if (!target || !intent) return res.status(400).json({code:'invalid_suspension_request'});
    const client=await pool.connect().catch(()=>null);
    if (!client) return res.status(503).json({code:'suspension_unavailable'});
    let broken=false;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='15s'");
      const admin=await client.query('SELECT id FROM admin_accounts WHERE id=$1 AND is_active=TRUE FOR SHARE',[req.user.id]);
      if (!admin.rowCount) {await client.query('ROLLBACK');return res.status(403).json({code:'admin_inactive'});}
      // Profile -> account lock order matches account deletion and booking writers.
      const table=target.role==='barber'?'barbers':'customers';
      if (target.role==='barber') await client.query('SELECT pg_advisory_xact_lock($1)',[target.id]);
      const profile=await client.query(`SELECT id,user_id FROM ${table} WHERE id=$1 FOR UPDATE`,[target.id]);
      if (!profile.rowCount) {await client.query('ROLLBACK');return res.status(404).json({code:'account_not_found'});}
      const userId=profile.rows[0].user_id;
      const user=await client.query('SELECT id,role,admin_suspended_at FROM users WHERE id=$1 FOR UPDATE',[userId]);
      if (!user.rowCount || user.rows[0].role!==target.role) {
        await client.query('ROLLBACK');return res.status(404).json({code:'account_not_found'});
      }
      const suspended=user.rows[0].admin_suspended_at!=null;
      if (suspended!==intent.expectedSuspended) {
        await client.query('ROLLBACK');return res.status(409).json({code:'suspension_state_changed'});
      }
      await client.query(`UPDATE users SET admin_suspended_at=${intent.action==='suspend'?'clock_timestamp()':'NULL'} WHERE id=$1`,[userId]);
      // Invalidate JWTs issued before the suspension; restoring never resurrects them.
      await client.query(`INSERT INTO account_session_versions(user_id,version) VALUES($1,1)
        ON CONFLICT(user_id) DO UPDATE SET version=account_session_versions.version+1`,[userId]);
      await client.query(`UPDATE account_device_sessions SET revoked_at=clock_timestamp()
        WHERE user_id=$1 AND revoked_at IS NULL`,[userId]);
      const event=await client.query(`INSERT INTO admin_account_suspension_events(user_id,actor_admin_id,action,reason)
        VALUES($1,$2,$3,$4) RETURNING id`,[userId,req.user.id,intent.action,intent.reason]);
      if (intent.action==='suspend') {
        const eventId=event.rows[0]?.id;
        if (!Number.isSafeInteger(Number(eventId)) || Number(eventId)<1) throw Error('No suspension event id');
        const fk=target.role==='barber'?'barber_id':'customer_id';
        // Create follow-up tasks in the same transaction. Never send a message here.
        await client.query(`INSERT INTO admin_suspension_booking_cases(suspension_event_id,booking_id)
          SELECT $1,b.id FROM bookings b WHERE b.${fk}=$2
          AND b.status IN ('pending','confirmed')
          AND b.booking_time + b.duration_minutes * INTERVAL '1 minute' > clock_timestamp()
          ON CONFLICT DO NOTHING`,[eventId,target.id]);
      }
      await client.query('COMMIT');
      return res.json({role:target.role,profileId:target.id,suspended:intent.action==='suspend',
        sessionsRevoked:true,bookingsChanged:false});
    } catch {
      try {await client.query('ROLLBACK');} catch {broken=true;}
      // COMMIT may have succeeded even when its result is unknown. Never auto retry.
      return res.status(503).json({code:'suspension_state_unknown',message:'Holat nomaʼlum. Qayta yuborishdan oldin ro‘yxatni yangilang.'});
    } finally {client.release(broken);}
  }};
}
module.exports={targetOf,intentOf,createHandlers};
