// No DDL/migrations. Only explicit local fixture writes and ID-ledger cleanup.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const {spawnSync}=require('node:child_process');
const {Pool}=require('pg');
const jwt=require('jsonwebtoken');
const {assertTestIdentity,testTarget}=require('./testDatabaseTarget');
const {createReportRedactor,validateLocalRoute,securityReservationLimitation,reserveLocalPhone,reserveLocalIp,cleanupPhoneSecurity,assertRunSecurityRemoved}=require('./localAuth');
function ensure(value,message){if(!value){const error=new Error(message);error.safe=true;throw error;}}
function safePermissionMessage(error){
 if(error?.code!=='42501')return null;
 const message=String(error.message||'');
 return /^permission denied (?:for|to) [A-Za-z0-9_ .'"-]{1,160}$/.test(message)?message:'permission denied (details suppressed)';
}
function safePermissionLog(args){
 const raw=args.map(value=>typeof value==='string'?value:'').join(' ');
 const match=raw.match(/permission denied for (?:table|sequence|schema) [A-Za-z0-9_."]+|permission denied to set parameter "[A-Za-z0-9_.-]+"/i);
 return match?.[0]||null;
}
const tables=['users','customers','barbers','services','barber_working_hours','bookings','admin_accounts','ustara_schema_migrations',
 'registration_phone_limits','pending_registrations','registration_otp_history','registration_security_events','registration_admin_actions',
 'login_attempt_limits','account_session_versions','password_reset_limits','password_reset_requests','password_reset_events',
 'barber_telegram_links','barber_telegram_link_tokens','telegram_bot_state'];
async function createLocalBookingHarness(){
 ensure(process.env.USTARA_LOCAL_BOOKING_WRITE_TESTS==='I_AUTHORIZE_TEST_DATA','Explicit local booking write opt-in required');
 ensure(!/^(prod|production)$/i.test(process.env.NODE_ENV||''),'Production environment forbidden');
 ensure(!process.env.USTARA_TEST_SEARCH_PATH&&process.env.USTARA_TEST_USE_APP_DATABASE_URL!=='1','Unexpected test database override');
 const databaseUrl=process.env.USTARA_TEST_DATABASE_URL;
 const target=testTarget(databaseUrl,'Local booking test database');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-local-booking-'));fs.chmodSync(root,0o700);
 const run=crypto.randomBytes(8).toString('hex'),application='ustara_booking_'+run;
 const report={root,run,database:'ustara_test_db',securityReservationLimitation,cases:[],requests:[],assertions:[],parallel:[],telegram:[],logs:[],
  dependencies:{sql:'real PostgreSQL 18.6',http:'real Express routes/controllers/middleware',telegram:'mock transport; real notifier, update handler and booking status service',
   authentication:'fixture JWTs, real DB identity middleware; auth test suite not rerun'},
  ledger:{users:[],customers:[],barbers:[],services:[],barber_working_hours:[],bookings:[],barber_telegram_links:[]}};
 const ids=report.ledger;
 const protectedIds=Object.fromEntries(Object.keys(ids).map(table=>[table,new Set()]));
 const phones=[],ips=[],authTokens=new Set();
 const pool=new Pool({connectionString:databaseUrl,ssl:false,max:12,connectionTimeoutMillis:5000,
  application_name:application,options:'-c search_path=public -c timezone=UTC -c log_parameter_max_length_on_error=0'});
 const control=await pool.connect();
 let setupOperation='initializing local test harness';
 let baseline,schemaBefore,adminBefore,historyBefore,server,closed=false,currentCase='setup',failSend=false;
 const saved={},oldFetch=global.fetch,oldConfig=require('dotenv').config,oldConsole=console.error;
 const telegramModule=require('../../telegram/api'),oldFactory=telegramModule.createTelegramApi;
 const dbFile=require.resolve('../../db'),oldDb=require.cache[dbFile];
 const redactReport=createReportRedactor();
 const write=(finalSuccess)=>{
  report.ownership={phoneHashes:phones.map(phone=>crypto.createHash('sha256').update(phone).digest('hex')),
   ipHashes:ips.map(ip=>crypto.createHash('sha256').update(ip).digest('hex'))};
  try{
   fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(redactReport({...report,...(finalSuccess===undefined?{}:{success:finalSuccess})}),null,2));
   if(finalSuccess!==undefined)report.success=finalSuccess;
  }catch{
   report.success=false;report.reportFailure={message:'Report write failed'};report.fail=Math.max(1,report.fail||0);
   throw new Error('Local booking report write failed');
  }
 };
 const reservePhone=async()=>{ensure(baseline,'Fixture reservation requires verified baseline');const phone=await reserveLocalPhone(control,phones);write();return phone;};
 const track=(table,id)=>{
  ensure(Object.hasOwn(ids,table)&&Number.isSafeInteger(id)&&id>0,'Invalid owned fixture ID');
  ensure(!protectedIds[table].has(id),'Pre-existing IDs cannot enter this run ledger');
  if(table==='barber_telegram_links')ensure(ids.barbers.includes(id),'Telegram link must belong to a run-owned barber');
  if(!ids[table].includes(id))ids[table].push(id);write();return id;
 };
 const owned=(table,id)=>ensure(ids[table].includes(id),'Only exact run-owned IDs may be mutated');
 const check=(value,message)=>{ensure(value,message);report.assertions.push({case:currentCase,message,result:'PASS'});};
 const fingerprint=async()=>{
  const result={};for(const table of tables){setupOperation=`reading baseline rows from public.${table}`;result[table]=(await control.query(`SELECT count(*)::int AS count,
   md5(coalesce(string_agg(data,'' ORDER BY data COLLATE "C"),'')) AS digest FROM (SELECT to_jsonb(r)::text AS data FROM public.${table} r) rows_data`)).rows[0];}
  return result;
 };
 const schema=async()=>{setupOperation='reading public schema manifest';return (await control.query(`SELECT md5(coalesce(string_agg(item,'' ORDER BY item COLLATE "C"),'')) AS digest FROM (
  SELECT jsonb_build_object('table',c.relname,'kind',c.relkind,'comment',obj_description(c.oid,'pg_class'),'name',a.attname,'num',a.attnum,
    'type',a.atttypid,'mod',a.atttypmod,'nn',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid))::text AS item
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public'
  UNION ALL SELECT (to_jsonb(k)-'oid')::text FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
  UNION ALL SELECT pg_get_indexdef(i.indexrelid) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') x`)).rows[0].digest;};
 async function collectBookings(){
  if(!ids.customers.length||!ids.barbers.length)return;
  for(const row of (await control.query('SELECT id FROM bookings WHERE customer_id=ANY($1::int[]) AND barber_id=ANY($2::int[])',[ids.customers,ids.barbers])).rows)track('bookings',row.id);
 }
 async function cleanup(){
  await assertTestIdentity(control,target);
  for(const [table,list] of Object.entries(ids))ensure(list.every(id=>!protectedIds[table].has(id)),'Refusing cleanup of pre-existing IDs');
  // Discover any committed response-lost booking using newly created parent IDs,
  // persist exact child IDs, then DELETE only the ledger's explicit PKs.
  await collectBookings();await control.query('BEGIN');
  try{
   Object.assign(report.cleanup.deleted,await cleanupPhoneSecurity(control,phones,ips,ids.users));
   for(const table of ['bookings','barber_telegram_links','services','barber_working_hours','customers','barbers','users']){
    const key=table==='barber_telegram_links'?'barber_id':'id';
    const result=await control.query(`DELETE FROM public.${table} WHERE ${key}=ANY($1::int[]) RETURNING ${key}`,[ids[table]]);
    report.cleanup.deleted[table]=result.rowCount;
   }
   await assertRunSecurityRemoved(control,phones,ips,ids.users);
   await control.query('COMMIT');
  }catch(error){await control.query('ROLLBACK');throw error;}
  for(const [table,list] of Object.entries(ids)){
   const key=table==='barber_telegram_links'?'barber_id':'id';
   ensure((await control.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${key}=ANY($1::int[])`,[list])).rows[0].n===0,'Owned IDs remain after cleanup');
  }
 }
 async function close(){if(closed)return;closed=true;
  try{if(server)await new Promise(resolve=>server.close(resolve));if(baseline){
    report.cleanup={deleted:{},own_rows_removed:false};await cleanup();
    report.cleanup.own_rows_removed=true;
    report.cleanup.original_rows_unchanged=JSON.stringify(await fingerprint())===JSON.stringify(baseline);
    report.cleanup.admin_unchanged=JSON.stringify((await control.query('SELECT * FROM admin_accounts ORDER BY id')).rows)===JSON.stringify(adminBefore);
    report.cleanup.history_unchanged=JSON.stringify((await control.query('SELECT * FROM ustara_schema_migrations ORDER BY version')).rows)===JSON.stringify(historyBefore);
    report.cleanup.schema_unchanged=await schema()===schemaBefore;
    ensure(Object.entries(report.cleanup).filter(([k])=>k!=='deleted').every(([,v])=>v===true)&&!report.externalCleanupFailed,'Cleanup/preservation invariant failed');
   }
  }catch(error){
   report.cleanupFailure={message:'Cleanup or preservation verification failed'};report.cleanup={...report.cleanup,status:'FAIL'};
   throw new Error('Local booking cleanup failed; inspect the redacted report');
  }finally{
   try{
    try{await control.query('SELECT pg_advisory_unlock_all()');}finally{control.release();await pool.end();}
   }catch(error){report.cleanupFailure={message:'Cleanup connection release failed'};throw new Error('Local booking cleanup connection release failed');}
   finally{
    global.fetch=oldFetch;require('dotenv').config=oldConfig;console.error=oldConsole;telegramModule.createTelegramApi=oldFactory;
    if(oldDb)require.cache[dbFile]=oldDb;else delete require.cache[dbFile];
    for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    report.pass=report.cases.filter(c=>c.status==='PASS').length;
    report.fail=report.cases.filter(c=>c.status==='FAIL').length+(report.cleanupFailure?1:0)+(report.externalCleanupFailed?1:0)+(report.reportFailure?1:0);
    write(!report.setupFailure&&!report.cleanupFailure&&!report.externalCleanupFailed&&!report.reportFailure&&report.fail===0);
   }
  }
 }
 try{
  setupOperation='checking database identity and local PostgreSQL server metadata';
  const identity=(await control.query(`SELECT current_database() AS database,session_user,current_setting('server_version_num') AS version,
   current_setting('port') AS port,host(inet_server_addr()) AS address`)).rows[0];
  const localAddress=target.host.startsWith('/')?identity.address===null:['127.0.0.1','::1'].includes(identity.address);
  ensure(identity.database==='ustara_test_db'&&identity.session_user===target.sessionUser&&identity.version==='180006'&&localAddress,'Local test PostgreSQL 18.6 identity mismatch');
  setupOperation='checking local PostgreSQL cluster registry';const registry=spawnSync('/usr/bin/pg_lsclusters',['--json'],{encoding:'utf8'});
  ensure(registry.status===0&&JSON.parse(registry.stdout).some(c=>c.running&&c.version==='18'&&String(c.port)===identity.port),'Local cluster registry mismatch');
  report.identity={database:'ustara_test_db',version:'18.6',local:true};
  setupOperation='acquiring local integration advisory lock';ensure((await control.query("SELECT pg_try_advisory_lock(hashtext(current_database()),hashtext('ustara-local-auth-integration')) AS ok")).rows[0].ok,'Another local integration run is active');
  baseline=await fingerprint();schemaBefore=await schema();setupOperation='reading public.admin_accounts baseline';adminBefore=(await control.query('SELECT * FROM admin_accounts ORDER BY id')).rows;
  setupOperation='reading public.ustara_schema_migrations baseline';historyBefore=(await control.query('SELECT * FROM ustara_schema_migrations ORDER BY version')).rows;
  for(const table of Object.keys(ids)){
   setupOperation=`reading fixture-protection IDs from public.${table}`;
   const key=table==='barber_telegram_links'?'barber_id':'id';
   for(const row of (await control.query(`SELECT ${key} AS id FROM public.${table}`)).rows)protectedIds[table].add(row.id);
  }
  setupOperation='checking public.login_attempt_limits permission while reserving fixture IP';await reserveLocalIp(control,ips);write();
  const key=crypto.randomBytes(48).toString('hex');
  for(const [name,value] of Object.entries({JWT_SECRET:key,NODE_ENV:'test',OTP_SMS_ADAPTER:'test',OTP_EXPOSE_CODE:'true',
   OTP_HMAC_KEY:crypto.randomBytes(48).toString('hex'),OTP_HMAC_KEY_ID:'local-customer-test'})){
   saved[name]=process.env[name];process.env[name]=value;
  }
  redactReport({JWT_SECRET:key,OTP_HMAC_KEY:process.env.OTP_HMAC_KEY});
  require.cache[dbFile]={id:dbFile,filename:dbFile,loaded:true,exports:pool};
  require('dotenv').config=()=>({parsed:{}});global.fetch=async()=>{throw new Error('External network forbidden');};
  console.error=(...args)=>{
   const item={case:currentCase,kind:String(args[0]).startsWith('Telegram booking notification failed')?'telegram_delivery_failure':'backend_error'};
   const message=safePermissionLog(args);if(message)item.message=message;
   report.logs.push(item);
  };
  const transport=async(method,body)=>{
   const item={case:currentCase,method};
   if(method==='sendMessage'){
    const match=/^Yangi booking #(\d+)/.exec(body.text);ensure(match,'Notification must contain booking ID');const id=Number(match[1]);
    const record=(await control.query('SELECT * FROM bookings WHERE id=$1',[id])).rows[0];
    ensure(record&&ids.barbers.includes(record.barber_id)&&ids.customers.includes(record.customer_id),'Notification booking must be committed and run-owned');track('bookings',id);
    item.bookingId=id;item.committedVisibleFromOtherConnection=true;
    item.buttons=body.reply_markup.inline_keyboard.flat().map(b=>b.callback_data.split(':')[1]);
    item.containsTashkent=body.text.includes('Asia/Tashkent');
    item.notificationFieldsPresent=body.text.includes('Mijoz:')&&body.text.includes('Xizmat:')&&body.text.includes('Boshlanish:')&&body.text.includes('Tugash:');
    report.telegram.push(item);if(failSend)throw new Error('Injected test transport failure');return {message_id:report.telegram.length};
   }
   if(method==='answerCallbackQuery'){item.alert=body.show_alert;item.text=body.text;}
   if(method==='editMessageReplyMarkup')item.buttonsRemoved=body.reply_markup.inline_keyboard.length===0;
   report.telegram.push(item);return true;
  };
  telegramModule.createTelegramApi=()=>transport;
  const app=require('../../server');server=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
  const {createBookingStatusService}=require('../../services/bookingStatusService');
  const {createUpdateHandler}=require('../../telegram/handler');
  const botId=700000000000+crypto.randomInt(1000000);
  const handler=createUpdateHandler({service:{},api:transport,bookings:createBookingStatusService({pool}),username:'local_test_bot',botId});
  async function callback(bookingId,status,chatId,extra={}){
   const query={id:'test_'+crypto.randomBytes(8).toString('hex'),from:{id:chatId,is_bot:false},
    message:{message_id:1,from:{id:botId,is_bot:true},chat:{id:chatId,type:'private'}},data:`booking:${status}:${bookingId}`,...extra};
   const start=report.telegram.length;await handler({callback_query:query});return report.telegram.slice(start);
  }
  async function call(method,route,body,actor){
   const customerAuth=validateLocalRoute(method,route);
   redactReport({request:body,authorization:actor?.token});
   if(customerAuth){
    if(body?.phone)ensure(phones.includes(body.phone),'Auth phone must be reserved by this run');
    for(const field of ['sessionToken','challengeToken','resetToken'])if(body?.[field])ensure(authTokens.has(body[field]),'Auth credential must originate from this run');
   }
   const data=body===undefined?null:JSON.stringify(body);
   const response=await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:server.address().port,path:route,method,agent:false,
     ...(customerAuth?{localAddress:ips[0]}:{}),
     headers:{...(data?{'content-type':'application/json','content-length':Buffer.byteLength(data)}:{}),...(actor?{authorization:'Bearer '+actor.token}:{})}},res=>{
     const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString())});}catch{reject(new Error('Invalid JSON (body suppressed)'));}});
    });req.setTimeout(20000,()=>req.destroy(new Error('Local HTTP timeout')));req.on('error',reject);req.end(data);});
   if(method==='POST'&&route==='/api/bookings'&&response.status===201)track('bookings',response.body.data.id);
   if(customerAuth&&response.status<400){
    for(const field of ['sessionToken','challengeToken','resetToken'])if(typeof response.body[field]==='string')authTokens.add(response.body[field]);
    if(route==='/api/auth/registration/complete'&&response.status===201){
     const claims=jwt.verify(response.body.token,key);
     ensure(['customer','barber'].includes(claims.role),'Invalid created fixture role');
     const account=(await control.query('SELECT phone FROM users WHERE id=$1',[claims.id])).rows[0];
     ensure(account&&phones.includes(account.phone),'Created account must use a run-reserved phone');
     track('users',claims.id);track(claims.role==='customer'?'customers':'barbers',claims.profileId);
    }
   }
   // Sanitize before insertion AND on every report write. Actual HTTP results
   // remain untouched in memory for test assertions/token handoff.
   report.requests.push(redactReport({case:currentCase,method,route,request:customerAuth?'<auth payload suppressed>':body??null,status:response.status,response:customerAuth?'<auth payload suppressed>':response.body}));write();return response;
  }
  async function scenario(name,work){currentCase=name;try{await work();report.cases.push({name,status:'PASS'});}catch(e){
   report.cases.push({name,status:'FAIL',reason:e.safe?e.message:'Unexpected error (details suppressed)',code:e.code||null});write();throw new Error(name+': '+(e.safe?e.message:e.code||'unexpected error'));}write();}
  async function insert(table,columns,values){ensure(Object.hasOwn(ids,table)&&table!=='bookings','Invalid fixture table');
   const pk=table==='barber_telegram_links'?'barber_id':'id';const result=await control.query(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${values.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING ${pk}`,values);
   return track(table,result.rows[0][pk]);
  }
  async function person(role,approved=true){const password='BookingFixturePass123';const pass=await require('../../utils/passwordPolicy').hashPassword(password);
   const phone=await reservePhone();
   await control.query('BEGIN');try{
    const userId=await insert('users',['phone','password','role'],[phone,pass,role]);
    const names=['user_id','first_name','last_name'],values=[userId,'Booking','Test'+run.replace(/[0-9]/g,'a')];
    if(role==='barber'){names.push('specialty','verification_status');values.push('barber',approved?'approved':'pending');}
    const profileId=await insert(role==='customer'?'customers':'barbers',names,values);await control.query('COMMIT');
    const actor={userId,profileId,role,phone,password,token:jwt.sign({id:userId,profileId,role,sessionVersion:0},key,{expiresIn:'30m'})};
    redactReport(actor);return actor;
   }catch(e){await control.query('ROLLBACK');throw e;}}
  async function seedBooking(customer,barber,serviceId,time,duration,status){owned('customers',customer.profileId);owned('barbers',barber.profileId);owned('services',serviceId);
   const result=await control.query('INSERT INTO bookings(customer_id,barber_id,service_id,booking_time,duration_minutes,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[customer.profileId,barber.profileId,serviceId,time,duration,status]);return track('bookings',result.rows[0].id);}
  async function parallel(label,barberId,requests){owned('barbers',barberId);const holder=await pool.connect();await holder.query('BEGIN');
   await holder.query('SELECT pg_advisory_xact_lock($1)',[barberId]);const holderPid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   const batch=Promise.all(requests.map(f=>f()));batch.catch(()=>{});let pids=[];
   try{for(let i=0;i<100;i++){const waits=(await control.query("SELECT pid,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",[application])).rows;
    const graph=new Map(waits.map(r=>[r.pid,r.blockers]));const reaches=(pid,seen=new Set())=>pid===holderPid||(!seen.has(pid)&&seen.add(pid)&&(graph.get(pid)||[]).some(p=>reaches(p,new Set(seen))));
    pids=waits.filter(r=>reaches(r.pid)).map(r=>r.pid);if(pids.length>=requests.length)break;await new Promise(r=>setTimeout(r,25));
   }}finally{await holder.query('ROLLBACK');holder.release();}
   const results=await batch;report.parallel.push({label,barberId,backendPids:pids,participants:requests.length});
   check(pids.length>=requests.length,'Separate PostgreSQL backends waited on the actual barber advisory lock');return results;
  }
  return {root,report,pool,control,ids,check,owned,track,insert,person,reservePhone,seedBooking,call,scenario,parallel,callback,close,writeReport:write,
    assertIdentity:()=>assertTestIdentity(control,target),
    setSendFailure:value=>{failSend=value;}};
 }catch(e){const permissionMessage=safePermissionMessage(e);report.setupFailure={reason:e.safe?e.message:(permissionMessage||'Setup failed (details suppressed)'),operation:setupOperation,code:e.code||null};try{await close();}catch{throw new Error('Local booking setup and cleanup failed; inspect the redacted report');}throw new Error('Cannot safely prepare local booking test; '+(e.safe?e.message:e.code==='42501'?`${e.code} during ${setupOperation}: ${permissionMessage}`:e.code||'setup failure'));}
}
module.exports={createLocalBookingHarness};
