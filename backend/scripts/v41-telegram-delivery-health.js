'use strict';
// Operator-only health read. Does not send or retry a Telegram message and
// never exposes chat_id, token, user id, booking id or raw database errors.
const {createPoolConfig}=require('../database/poolConfig');
const SQL=`SELECT 'queue'::text AS channel,status,COUNT(*)::int AS total,
  COUNT(*) FILTER(WHERE status='pending' AND next_attempt_at<=clock_timestamp())::int AS due,
  COUNT(*) FILTER(WHERE status='pending' AND next_attempt_at<clock_timestamp()-interval '15 minutes')::int AS overdue_pending,
  COUNT(*) FILTER(WHERE status='processing' AND (lease_until IS NULL OR lease_until<clock_timestamp()))::int AS stale_lease
 FROM walkin_queue_notification_outbox GROUP BY status
 UNION ALL
 SELECT 'smart_booking'::text AS channel,status,COUNT(*)::int AS total,
  COUNT(*) FILTER(WHERE status='pending' AND next_attempt_at<=clock_timestamp())::int AS due,
  COUNT(*) FILTER(WHERE status='pending' AND next_attempt_at<clock_timestamp()-interval '15 minutes')::int AS overdue_pending,
  COUNT(*) FILTER(WHERE status='sending' AND (lease_until IS NULL OR lease_until<clock_timestamp()))::int AS stale_lease
 FROM smart_booking_telegram_outbox GROUP BY status ORDER BY channel,status`;
const STATUSES={queue:new Set(['pending','processing','sent','failed','cancelled','uncertain']),
 smart_booking:new Set(['pending','sending','sent','failed','cancelled','uncertain'])};
function summarize(rows){
 const summary={queue:{},smart_booking:{}};
 for(const row of rows){
  if(!Object.hasOwn(STATUSES,row.channel)||!STATUSES[row.channel].has(row.status))
   throw new Error('Unknown Telegram outbox channel or status');
  if(Object.hasOwn(summary[row.channel],row.status))
   throw new Error('Duplicate Telegram outbox aggregate; operator review required');
  const data={total:Number(row.total),due:Number(row.due),overdue_pending:Number(row.overdue_pending??0),stale_lease:Number(row.stale_lease)};
  if(Object.values(data).some(x=>!Number.isSafeInteger(x)||x<0)||data.due>data.total||data.overdue_pending>data.due||data.stale_lease>data.total
     ||(row.status!=='pending'&&(data.due!==0||data.overdue_pending!==0))
     ||(!['processing','sending'].includes(row.status)&&data.stale_lease!==0))
   throw new Error('Invalid Telegram outbox aggregate');
  summary[row.channel][row.status]=data;
 }
 const attention=Object.entries(summary).flatMap(([channel,values])=>Object.entries(values)
  .filter(([status,data])=>(['failed','uncertain'].includes(status)&&data.total>0)||data.stale_lease>0||data.overdue_pending>0)
  .map(([status,data])=>({channel,status,count:data.total,stale_lease:data.stale_lease,overdue_pending:data.overdue_pending})));
 return {summary,attention,action:'Manual operator review only; do not automatically resend uncertain messages'};
}
async function audit(pool){return summarize((await pool.query(SQL)).rows);}
async function main(env=process.env){
 let Pool;try{({Pool}=require('pg'));}catch{throw Error('Required pg package is not installed');}
 const config=createPoolConfig(env);
 const pool=new Pool({...config,max:1,connectionTimeoutMillis:5000,statement_timeout:8000,
   options:'-c default_transaction_read_only=on -c statement_timeout=8000',
   application_name:'ustara_v41_queue_health_read_only'});
 try{console.log(JSON.stringify(await audit(pool),null,2));}
 finally{await pool.end();}
}
if(require.main===module)main().catch(()=>{
 console.error('Telegram delivery health was NOT verified: check PG connection, role and migrations.');
 process.exitCode=1;
});
module.exports={SQL,summarize,audit};
