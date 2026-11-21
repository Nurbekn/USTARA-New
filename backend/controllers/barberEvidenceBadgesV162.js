'use strict';
// v162 / #46–#48. Badge names describe checks, not a promise of service quality.
const TYPES=Object.freeze(['identity_checked','experience_checked','portfolio_checked']);
const allowed=new Set(TYPES);
const idOf=value=>typeof value==='string' && /^(?:[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const validRevision=value=>typeof value==='number' && Number.isSafeInteger(value) && value>=0;
function changeInput(body){
 if(!body||typeof body!=='object'||Array.isArray(body)
   ||Object.keys(body).sort().join(',')!=='action,evidence_note,expected_revision')return null;
 const {action,evidence_note,expected_revision}=body;
 if(!['grant','revoke'].includes(action)||!validRevision(expected_revision)||typeof evidence_note!=='string')return null;
 const note=evidence_note.trim();
 if(note.length<20||note.length>500||/[\u0000-\u001f\u007f]/.test(note))return null;
 return {action,note,expectedRevision:expected_revision};
}
function createHandlers(db){
 db=db||require('../db');
 const failed=(res,e)=>{console.error('badge_v162_db_error',e?.code||'unavailable');return res.status(503).json({code:'badge_unavailable',message:'Badge holatini tekshirib bo‘lmadi.'});};
 const forbidden=res=>res.status(403).json({code:'forbidden'});
 async function publicList(req,res){
  res.set('Cache-Control','no-store');
  const barberId=idOf(req.params?.id);
  if(!barberId)return res.status(400).json({code:'invalid_barber'});
  try{
   const r=await db.query(`SELECT b.id,COALESCE(json_agg(eb.badge_type ORDER BY eb.badge_type)
     FILTER (WHERE eb.badge_type IS NOT NULL),'[]'::json) AS badges
     FROM barbers b LEFT JOIN barber_evidence_badges eb ON eb.barber_id=b.id AND eb.state='active'
     WHERE b.id=$1 AND b.verification_status='approved' GROUP BY b.id`,[barberId]);
   if(r.rowCount!==1)return res.status(404).json({code:'barber_not_found'});
   // NEVER return evidence, admin identity, revisions or revoked badges to guests.
   return res.json({barberId,badges:(r.rows[0].badges||[]).filter(x=>allowed.has(x))});
  }catch(e){return failed(res,e);}
 }
 async function list(req,res){
  res.set('Cache-Control','no-store');
  if(req.user?.role!=='admin')return forbidden(res);
  const page=req.query?.page===undefined?'1':req.query.page;
  if(typeof page!=='string'||!/^[1-9]\d{0,2}$/.test(page)||Number(page)>100||Object.keys(req.query||{}).some(k=>k!=='page'))
   return res.status(400).json({code:'invalid_page'});
  try{
   const r=await db.query(`SELECT b.id,b.first_name,b.last_name,b.verification_status,
       COALESCE(json_agg(json_build_object('type',eb.badge_type,'state',eb.state,'revision',eb.revision,
          'changedAt',eb.changed_at) ORDER BY eb.badge_type)
          FILTER(WHERE eb.badge_type IS NOT NULL),'[]'::json) AS badges
      FROM barbers b LEFT JOIN barber_evidence_badges eb ON eb.barber_id=b.id
      WHERE b.verification_status='approved' GROUP BY b.id ORDER BY b.id DESC LIMIT 51 OFFSET $1`,[(Number(page)-1)*50]);
   return res.json({page:Number(page),hasNext:r.rows.length>50,barbers:r.rows.slice(0,50)});
  }catch(e){return failed(res,e);}
 }
 async function change(req,res){
  res.set('Cache-Control','no-store');
  if(req.user?.role!=='admin')return forbidden(res);
  const adminId=Number(req.user.id),barberId=idOf(req.params?.barberId),type=req.params?.badgeType;
  if(!Number.isSafeInteger(adminId)||adminId<1)return res.status(401).json({code:'invalid_session'});
  const input=changeInput(req.body);
  if(!barberId||!allowed.has(type)||!input)return res.status(400).json({code:'invalid_badge_change'});
  let c,started=false,broken=false;
  try{
   c=await db.connect();await c.query('BEGIN');started=true;
   await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='15s'");
   // A barber lock serializes both first grants (no badge row yet) and revocations.
   const owner=await c.query(`SELECT id,verification_status FROM barbers WHERE id=$1 FOR UPDATE`,[barberId]);
   if(owner.rowCount!==1||owner.rows[0].verification_status!=='approved'){
    await c.query('ROLLBACK');started=false;
    return res.status(404).json({code:'approved_barber_not_found'});
   }
   const current=await c.query(`SELECT state,revision FROM barber_evidence_badges
      WHERE barber_id=$1 AND badge_type=$2 FOR UPDATE`,[barberId,type]);
   const previous=current.rows[0];const revision=previous?Number(previous.revision):0;
   if(!Number.isSafeInteger(revision)||revision<0)throw Error('Invalid badge revision');
   if(input.expectedRevision!==revision|| (input.action==='grant'&&previous?.state==='active')
      ||(input.action==='revoke'&&previous?.state!=='active')){
    await c.query('ROLLBACK');started=false;
    return res.status(409).json({code:'stale_badge',message:'Holat yangilangan. Ro‘yxatni qayta yuklang.'});
   }
   const nextState=input.action==='grant'?'active':'revoked';
   const changed=await c.query(`INSERT INTO barber_evidence_badges
     (barber_id,badge_type,state,evidence_note,revision,changed_by_admin_id)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT (barber_id,badge_type) DO UPDATE SET state=EXCLUDED.state,evidence_note=EXCLUDED.evidence_note,
      revision=EXCLUDED.revision,changed_by_admin_id=EXCLUDED.changed_by_admin_id,changed_at=clock_timestamp()
     RETURNING revision,state`,[barberId,type,nextState,input.note,revision+1,adminId]);
   if(changed.rowCount!==1)throw Error('Badge write did not occur');
   await c.query(`INSERT INTO barber_badge_audit_events(barber_id,badge_type,action,evidence_note,revision,actor_admin_id)
    VALUES($1,$2,$3,$4,$5,$6)`,[barberId,type,input.action,input.note,revision+1,adminId]);
   // A lost COMMIT acknowledgement is ambiguous. Client must GET before further changes.
   try{await c.query('COMMIT');started=false;}
   catch(e){broken=true;throw e;}
   return res.json({barberId,type,state:nextState,revision:revision+1});
  }catch(e){if(c&&started&&!broken)try{await c.query('ROLLBACK');}catch{broken=true;}return failed(res,e);}
  finally{if(c)c.release(broken);}
 }
 return {publicList,list,change};
}
module.exports={TYPES,idOf,validRevision,changeInput,createHandlers};
