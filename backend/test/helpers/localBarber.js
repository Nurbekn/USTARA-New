// Reuse verified local safety/fixtures/ID cleanup, not the old test suites.
const crypto=require('node:crypto');
const {createLocalBookingHarness}=require('./localBooking');
function requireCondition(value,message){if(!value){const e=new Error(message);e.safe=true;throw e;}}
const {createReportRedactor}=require('./localAuth');
async function createLocalBarberHarness(){
 requireCondition(process.env.USTARA_LOCAL_BARBER_WRITE_TESTS==='I_AUTHORIZE_TEST_DATA','Explicit barber test-write opt-in required');
 // Only bootstrap the shared helper; no authentication/booking tests are loaded.
 const oldFlag=process.env.USTARA_LOCAL_BOOKING_WRITE_TESTS;
 process.env.USTARA_LOCAL_BOOKING_WRITE_TESTS='I_AUTHORIZE_TEST_DATA';let base;
 try{base=await createLocalBookingHarness();}finally{if(oldFlag===undefined)delete process.env.USTARA_LOCAL_BOOKING_WRITE_TESTS;else process.env.USTARA_LOCAL_BOOKING_WRITE_TESTS=oldFlag;}
 const {report,control,pool,ids}=base;
 report.module='Barber API integration';report.dependencies.telegram='mock transport; real link service and update handler';
 report.ownedTokenBarberIds=[];report.linkOutcomes=[];report.linkMessages=[];
 // Shared booking helper persists every HTTP response immediately. Redact at
 // insertion BEFORE that write, while leaving the in-memory HTTP response intact.
 const redact=createReportRedactor();
 const push=report.requests.push.bind(report.requests);
 report.requests.push=(...items)=>push(...items.map(item=>redact(item)));
 const oldUsername=process.env.TELEGRAM_BOT_USERNAME,oldBotToken=process.env.TELEGRAM_BOT_TOKEN;
 delete process.env.TELEGRAM_BOT_TOKEN;
 process.env.TELEGRAM_BOT_USERNAME='ustara_local_test_bot';
 const {createTelegramLinkService}=require('../../services/telegramLinkService');
 const service=createTelegramLinkService({pool,env:{TELEGRAM_BOT_USERNAME:'ustara_local_test_bot'}});
 const {createUpdateHandler}=require('../../telegram/handler');
 let current='setup';
 const watched={...service,async consume(token,chatId){try{const result=await service.consume(token,chatId);
   report.linkOutcomes.push({case:current,result:'linked'});return result;
  }catch(e){report.linkOutcomes.push({case:current,result:'rejected',code:e.code||null,status:e.status||null});throw e;}}};
 const handler=createUpdateHandler({service:watched,username:'ustara_local_test_bot',api:async(method,body)=>{
  requireCondition(method==='sendMessage','Only mock sendMessage expected for linking commands');
  report.linkMessages.push({case:current,method,text:body.text,protect_content:body.protect_content});return true;
 }});
 const write=()=>base.writeReport();
 async function collect(){
  if(!ids.barbers.length)return;
  for(const table of ['services','barber_working_hours','barber_telegram_links','barber_telegram_link_tokens']){
   const key=['barber_telegram_links','barber_telegram_link_tokens'].includes(table)?'barber_id':'id';
   const rows=(await control.query(`SELECT ${key} AS id FROM ${table} WHERE barber_id=ANY($1::int[])`,[ids.barbers])).rows;
   for(const row of rows)if(table==='barber_telegram_link_tokens'){
    if(!report.ownedTokenBarberIds.includes(row.id))report.ownedTokenBarberIds.push(row.id);
   }else base.track(table,row.id);
  }write();
 }
 async function call(...args){try{return await base.call(...args);}finally{await collect();}}
 async function link(token,chatId){const from=report.linkOutcomes.length;
  try{await handler({message:{chat:{id:chatId,type:'private'},from:{id:chatId,is_bot:false},text:'/start '+token}});}finally{await collect();}
  return report.linkOutcomes.slice(from);
 }
 async function parallelRows(label,table,id,requests){
  requireCondition(['barbers','services'].includes(table),'Invalid row lock target');base.owned(table,id);
  const holder=await pool.connect();await holder.query('BEGIN');
  await holder.query(`SELECT id FROM ${table} WHERE id=$1 FOR UPDATE`,[id]);const holderPid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const batch=Promise.all(requests.map(f=>f()));batch.catch(()=>{});let pids=[];
  try{for(let i=0;i<100;i++){
   const waits=(await control.query("SELECT pid,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",['ustara_booking_'+report.run])).rows;
   const graph=new Map(waits.map(r=>[r.pid,r.blockers]));const reaches=(pid,seen=new Set())=>pid===holderPid||(!seen.has(pid)&&seen.add(pid)&&(graph.get(pid)||[]).some(p=>reaches(p,new Set(seen))));
   pids=waits.filter(r=>reaches(r.pid)).map(r=>r.pid);if(pids.length>=requests.length)break;await new Promise(r=>setTimeout(r,25));
  }}finally{await holder.query('ROLLBACK');holder.release();}
  const results=await batch;await collect();report.parallel.push({label,table,id,participants:requests.length,backendPids:pids});
  base.check(pids.length>=requests.length,'Independent PostgreSQL backends observed in actual row-lock wait chain');return results;
 }
 const reservedChats=new Set();
 async function freshChat(){let chat;do{chat=600000000000+crypto.randomInt(1000000000);}while(reservedChats.has(chat)||(await control.query('SELECT 1 FROM barber_telegram_links WHERE chat_id=$1',[chat])).rowCount);reservedChats.add(chat);return chat;}
 function mismatched(actor,profileId){return {...actor,token:require('jsonwebtoken').sign({id:actor.userId,profileId,role:actor.role,sessionVersion:0},process.env.JWT_SECRET,{expiresIn:'5m'})};}
 let closed=false;
 async function close(){if(closed)return;closed=true;let tokenCleanupError;
  try{await base.assertIdentity();await collect();
   const result=await control.query('DELETE FROM barber_telegram_link_tokens WHERE barber_id=ANY($1::int[]) RETURNING barber_id',[report.ownedTokenBarberIds]);
   report.tokenCleanup={deleted:result.rowCount,ownedTokenRowsAbsent:(await control.query('SELECT count(*)::int AS n FROM barber_telegram_link_tokens WHERE barber_id=ANY($1::int[])',[report.ownedTokenBarberIds])).rows[0].n===0};
   requireCondition(report.tokenCleanup.ownedTokenRowsAbsent,'Run-owned Telegram token rows remain');
  }catch(error){
   report.externalCleanupFailed=true;report.tokenCleanup={...report.tokenCleanup,status:'FAIL'};
   tokenCleanupError=new Error('Local barber token cleanup failed; inspect the redacted report');
  }finally{
   try{await base.close();}catch(error){if(tokenCleanupError)throw new AggregateError([tokenCleanupError,error],'Local barber token and base cleanup failed; inspect the redacted report');throw error;}finally{if(oldUsername===undefined)delete process.env.TELEGRAM_BOT_USERNAME;else process.env.TELEGRAM_BOT_USERNAME=oldUsername;if(oldBotToken===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=oldBotToken;}
  }
  if(tokenCleanupError)throw tokenCleanupError;
 }
 return {...base,call,link,collect,parallelRows,freshChat,mismatched,close,scenario:async(name,work)=>{current=name;return base.scenario(name,work);}};
}
module.exports={createLocalBarberHarness};
