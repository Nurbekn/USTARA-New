'use strict';
// Operator review queue only. No automatic outgoing messages or booking mutations.
const MAX_CASE_ID = 9223372036854775807n;
function caseIdOf(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,17}$/.test(value)) return null;
  const id=BigInt(value);
  return id>0n && id<=MAX_CASE_ID ? value : null;
}
function listOptions(query={}) {
  const status=query.status??'open';
  const page=query.page===undefined?1:Number(query.page);
  if (!['open','pending','reviewed','attempted','closed'].includes(status) ||
      !Number.isSafeInteger(page)||page<1||page>100 ||
      (query.page!==undefined && !/^[1-9]\d{0,2}$/.test(String(query.page)))) return null;
  return {status,page,limit:50,offset:(page-1)*50};
}
function mutationOf(body) {
  if (!body||typeof body!=='object'||Array.isArray(body)||
      !['review','attempt','close'].includes(body.action)||
      !Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0) return null;
  const channel=body.action==='attempt'?body.channel:null;
  if (body.action==='attempt' && !['phone','telegram','other'].includes(channel)) return null;
  if (body.action!=='attempt' && body.channel!==undefined) return null;
  return {action:body.action,channel,expectedRevision:body.expectedRevision};
}
function createHandlers(db) {
  if (!db?.query || !db?.connect) throw new TypeError('PostgreSQL pool required');
  return {
    async list(req,res) {
      res.set('Cache-Control','no-store');
      if(req.user?.role!=='admin'||!Number.isSafeInteger(req.user.id)) return res.status(403).json({code:'admin_required'});
      const options=listOptions(req.query);
      if(!options)return res.status(400).json({code:'invalid_case_filter'});
      try {
        const admin=await db.query('SELECT id FROM admin_accounts WHERE id=$1 AND is_active=TRUE',[req.user.id]);
        if(!admin.rowCount)return res.status(403).json({code:'admin_inactive'});
        const result=await db.query(`SELECT c.id,c.booking_id,c.status AS case_status,c.revision,
          c.created_at,c.updated_at,n.status AS telegram_notice_status,n.updated_at AS telegram_notice_updated_at,
          b.status AS booking_status,b.booking_time,
          u.role AS suspended_role,CASE WHEN u.role='barber' THEN 'customer' WHEN u.role='customer' THEN 'barber' ELSE NULL END AS contact_role,
          (u.admin_suspended_at IS NOT NULL) AS account_still_suspended,
          (u.role='customer' AND l.chat_id IS NOT NULL AND p.admin_suspended_at IS NULL AND p.deactivated_at IS NULL) AS telegram_contact_available
          FROM admin_suspension_booking_cases c
          JOIN admin_account_suspension_events e ON e.id=c.suspension_event_id
          LEFT JOIN admin_suspension_telegram_notices n ON n.case_id=c.id
          LEFT JOIN bookings b ON b.id=c.booking_id
          LEFT JOIN users u ON u.id=e.user_id
          LEFT JOIN barbers r ON r.id=b.barber_id
          LEFT JOIN users p ON p.id=r.user_id
          LEFT JOIN barber_telegram_links l ON l.barber_id=r.id
          WHERE ($1='open' AND c.status<>'closed') OR ($1<>'open' AND c.status=$1)
          ORDER BY c.id DESC LIMIT 51 OFFSET $2`,[options.status,options.offset]);
        const rows=result.rows.slice(0,50);
        return res.json({rows,page:options.page,status:options.status,hasMore:result.rows.length>50,
          notificationsSent:false,readOnlyListing:true});
      }catch {return res.status(503).json({code:'suspension_cases_unavailable'});}
    },
    async act(req,res) {
      res.set('Cache-Control','no-store');
      if(req.user?.role!=='admin'||!Number.isSafeInteger(req.user.id))return res.status(403).json({code:'admin_required'});
      const id=caseIdOf(req.params?.id),mutation=mutationOf(req.body);
      if(!id||!mutation)return res.status(400).json({code:'invalid_case_action'});
      const client=await db.connect().catch(()=>null);
      if(!client)return res.status(503).json({code:'case_action_unknown'});
      let broken=false;
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout='5s'");
        await client.query("SET LOCAL statement_timeout='15s'");
        const admin=await client.query('SELECT id FROM admin_accounts WHERE id=$1 AND is_active=TRUE FOR SHARE',[req.user.id]);
        if(!admin.rowCount){await client.query('ROLLBACK');return res.status(403).json({code:'admin_inactive'});}
        const result=await client.query(`SELECT c.id,c.status,c.revision,c.booking_id,e.user_id
          FROM admin_suspension_booking_cases c
          JOIN admin_account_suspension_events e ON e.id=c.suspension_event_id
          WHERE c.id=$1 FOR UPDATE OF c`,[id]);
        if(!result.rowCount){await client.query('ROLLBACK');return res.status(404).json({code:'case_not_found'});}
        const row=result.rows[0];
        const allowed=(mutation.action==='review'&&row.status==='pending')||
          (mutation.action==='attempt'&&['reviewed','attempted'].includes(row.status))||
          (mutation.action==='close'&&['reviewed','attempted'].includes(row.status));
        if(row.revision!==mutation.expectedRevision||!allowed){
          await client.query('ROLLBACK');return res.status(409).json({code:'case_state_changed'});
        }
        if(mutation.action==='close'){
          // A case cannot be marked closed with an unresolved booking while the user remains suspended.
          const booking=row.booking_id==null?null:await client.query('SELECT status FROM bookings WHERE id=$1 FOR SHARE',[row.booking_id]);
          const user=row.user_id==null?null:await client.query('SELECT admin_suspended_at FROM users WHERE id=$1 FOR SHARE',[row.user_id]);
          const isActive=!!booking?.rowCount&&['pending','confirmed'].includes(booking.rows[0].status);
          const stillSuspended=!!user?.rowCount && user.rows[0].admin_suspended_at!=null;
          if(isActive&&stillSuspended){
            await client.query('ROLLBACK');return res.status(409).json({code:'booking_still_needs_handling'});
          }
        }
        const status=mutation.action==='review'?'reviewed':mutation.action==='attempt'?'attempted':'closed';
        const saved=await client.query(`UPDATE admin_suspension_booking_cases
          SET status=$2,revision=revision+1,updated_at=clock_timestamp()
          WHERE id=$1 RETURNING revision`,[id,status]);
        await client.query(`INSERT INTO admin_suspension_booking_case_events(case_id,actor_admin_id,action,channel)
          VALUES($1,$2,$3,$4)`,[id,req.user.id,mutation.action,mutation.channel]);
        await client.query('COMMIT');
        return res.json({id,status,revision:saved.rows[0].revision,notificationsSent:false,bookingsChanged:false});
      }catch{
        try{await client.query('ROLLBACK');}catch{broken=true;}
        return res.status(503).json({code:'case_action_unknown',message:'Holat nomaʼlum. Qayta yuborishdan oldin ro‘yxatni yangilang.'});
      }finally{client.release(broken);}
    }
  };
}
module.exports={caseIdOf,listOptions,mutationOf,createHandlers};
