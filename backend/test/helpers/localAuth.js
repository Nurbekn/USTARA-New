// Explicit local-db opt-in only. No DDL, migrations, SQL mocks or external delivery.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');
const { assertTestIdentity, testTarget } = require('./testDatabaseTarget');
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
function check(value, label) { if (!value) { const e = new Error(label); e.safe = true; throw e; } }
// Exact auth routes only; never normalize an untrusted HTTP path into one.
const authRoutes = new Set([
  '/api/customers/login','/api/barbers/login','/api/customers/register','/api/barbers/register',
  ...['registration','password-reset'].flatMap(flow=>['start','resend','verify','complete'].map(step=>`/api/auth/${flow}/${step}`))
]);
function validateLocalRoute(method,route,authOnly=false) {
  check(typeof route==='string' && !/[\s#]/.test(route) && /^\/api\/[a-z0-9-]+(?:\/[a-z0-9-]+)*(?:\?[^#\s]*)?$/.test(route),'Non-canonical local route forbidden');
  if(method==='POST' && authRoutes.has(route))return true;
  // Keep the existing non-auth API calls explicit as well, so unknown auth
  // variants cannot fall through to HTTP or payload reporting.
  const self=method==='GET' && /^\/api\/(?:customers|barbers)\/me$/.test(route);
  const resource=!authOnly && (
    /^(?:GET|POST|PUT|DELETE)$/.test(method) && /^\/api\/(?:bookings|services)(?:\/(?:[1-9][0-9]*|available-slots))?(?:\?[^#\s]*)?$/.test(route)
    || /^(?:GET|PUT)$/.test(method) && /^\/api\/barbers\/(?:[1-9][0-9]*|working-hours)(?:\?[^#\s]*)?$/.test(route)
    || /^(?:GET|POST|DELETE)$/.test(method) && /^\/api\/barbers\/telegram(?:\/(?:start|status))?(?:\?[^#\s]*)?$/.test(route)
  );
  check(self || resource,'Method/route must be explicitly allowed');
  return false;
}
const securityReservationLimitation='Phone/IP checks and advisory locks are not atomic reservations against unrelated writers; security rows without run ownership are preserved and cause cleanup FAIL.';
const phoneSecurityTables = ['password_reset_requests','password_reset_events','password_reset_limits','pending_registrations',
  'registration_otp_history','registration_security_events','registration_admin_actions','registration_phone_limits'];
function createReportRedactor() {
  const secrets = new Set();
  const sensitive = key => {
    const name = key.replace(/[^a-z0-9]/gi,'').toLowerCase();
    return /password|passwd|secret|credential|authorization|cookie|connectionstring|databaseurl|(?:api|private|hmac|jwt|signing)key/.test(name)
      || /(?:tokens?|jwt)(?:hash)?$/.test(name) || /^sessions?$/.test(name) || /^(pwd|otp|otphash|otpcode|testotp|codeverifier|signature|phone|login)$/.test(name);
  };
  function collect(value,key='',inherited=false) {
    const protectedValue=inherited||sensitive(key);
    if((protectedValue||(key.toLowerCase()==='code'&&/^\d{4,8}$/.test(String(value)))) && ['string','number'].includes(typeof value)){
      const text=String(value);
      if(text.length>=4&&!['string','number','boolean','null'].includes(text)){secrets.add(text);secrets.add(encodeURIComponent(text));}
    }
    if(value && typeof value==='object')for(const [name,item] of Object.entries(value))collect(item,name,protectedValue);
  }
  function visit(value,key='') {
    // Table deletion counts are not passwords; retain cleanup evidence.
    if(sensitive(key) && !(phoneSecurityTables.includes(key) && typeof value==='number'))return '<redacted>';
    if(key.toLowerCase()==='code' && /^\d{4,8}$/.test(String(value)))return '<redacted>';
    if(Array.isArray(value))return value.map(item=>visit(item));
    if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([name,item])=>[name,visit(item,name)]));
    if(typeof value==='string'){
      for(const secret of secrets)value=value.split(secret).join('<redacted>');
      return value.replace(/\bBearer\s+[^\s"<>]+/gi,'Bearer <redacted>')
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'<redacted>')
        .replace(/([?&](?:password|token|otp|jwt|sessionToken|challengeToken|resetToken|api_key)=)[^&#\s]*/gi,'$1<redacted>');
    }
    return value;
  }
  return value=>{collect(value);return visit(value);};
}
async function phoneInUse(client,phone) {
  const selects=['users',...phoneSecurityTables].map(table=>`SELECT 1 FROM public.${table} WHERE phone=$1`);
  selects.push("SELECT 1 FROM public.login_attempt_limits WHERE scope='public' AND kind='account' AND key_hash=$2");
  return (await client.query(`SELECT EXISTS(${selects.join(' UNION ALL ')}) AS found`,[phone,hash(phone)])).rows[0].found;
}
async function reserveLocalPhone(client,phones) {
  let phone;
  do{phone='+998'+String(900000000+crypto.randomInt(100000000));}while(phones.includes(phone)||await phoneInUse(client,phone));
  phones.push(phone);return phone;
}
async function reserveLocalIp(client,ips) {
  let ip;
  do{ip=`127.${crypto.randomInt(20,240)}.${crypto.randomInt(1,255)}.${crypto.randomInt(1,255)}`;}
  while(ips.includes(ip)||(await client.query("SELECT EXISTS(SELECT 1 FROM public.login_attempt_limits WHERE scope='public' AND kind='ip' AND key_hash=$1) AS found",[hash(ip)])).rows[0].found);
  ips.push(ip);return ip;
}
// Phone/IP absence checks are not proof of row ownership. Never DELETE by
// these shared keys: an unrelated writer may have used them after reservation.
// Caller owns the transaction; fail before deleting anything when ambiguous.
async function cleanupPhoneSecurity(client,phones,ips,userIds) {
  for(const table of phoneSecurityTables){
    const result=await client.query(`SELECT EXISTS(SELECT 1 FROM public.${table} WHERE phone=ANY($1::text[])) AS found`,[phones]);
    check(!result.rows[0].found,securityReservationLimitation);
  }
  const limits=await client.query("SELECT EXISTS(SELECT 1 FROM public.login_attempt_limits WHERE scope='public' AND ((kind='account' AND key_hash=ANY($1::text[])) OR (kind='ip' AND key_hash=ANY($2::text[])))) AS found",[phones.map(hash),phones.flatMap(phone=>ips.map(ip=>hash(JSON.stringify([phone,ip]))))]);
  check(!limits.rows[0].found,securityReservationLimitation);
  return {account_session_versions:(await client.query('DELETE FROM public.account_session_versions WHERE user_id=ANY($1::int[])',[userIds])).rowCount};
}
async function assertRunSecurityRemoved(client,phones,ips,userIds) {
  for(const phone of phones)check(!await phoneInUse(client,phone),'Run-owned phone/account/security rows remain');
  check((await client.query("SELECT count(*)::int AS n FROM public.login_attempt_limits WHERE scope='public' AND kind='ip' AND key_hash=ANY($1::text[])",[phones.flatMap(phone=>ips.map(ip=>hash(JSON.stringify([phone,ip]))))])).rows[0].n===0,'Run-owned IP limit rows remain');
  check((await client.query('SELECT count(*)::int AS n FROM public.account_session_versions WHERE user_id=ANY($1::int[])',[userIds])).rows[0].n===0,'Run-owned session version rows remain');
}
async function createLocalAuthHarness() {
  check(process.env.USTARA_LOCAL_AUTH_WRITE_TESTS === 'I_AUTHORIZE_TEST_DATA', 'Local data-write opt-in required');
  check(!/^(prod|production)$/i.test(process.env.NODE_ENV || ''), 'Production environment forbidden');
  check(!process.env.USTARA_TEST_SEARCH_PATH && process.env.USTARA_TEST_USE_APP_DATABASE_URL !== '1', 'Unexpected test database override');
  const databaseUrl = process.env.USTARA_TEST_DATABASE_URL;
  const target = testTarget(databaseUrl, 'Local auth test database');
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'ustara-local-auth-')); fs.chmodSync(root,0o700);
  const run = crypto.randomBytes(8).toString('hex');
  const report = { run, root, database:'ustara_test_db', cases:[], requests:[], parallel:[], assertions:[],
    dependencies:{sql:'real PostgreSQL',http:'real Express routes over local TCP',hashing:'real bcrypt',otp:'real HMAC/random',
      sms:'existing test adapter with in-memory delivery observer',telegram:'not invoked; external fetch disabled'},
    securityReservationLimitation,
    fixtures:'Expiry/cooldown tests shift timestamps only on run-owned rows; database clock is not mocked.' };
  const application = 'ustara_auth_'+run;
  const pool = new Pool({connectionString:databaseUrl,ssl:false,max:12,connectionTimeoutMillis:5000,
    application_name:application,options:'-c search_path=public -c log_parameter_max_length=0 -c log_parameter_max_length_on_error=0'});
  const control = await pool.connect();
  const phones=[], ips=[], userIds=[], protectedUserIds=new Set(), deliveries=new Map();
  let server, baseline, adminBefore, schemaBefore, historyBefore, savedFetch, savedConfig, smsModule, savedSmsFactory;
  const originalEnv={}; let closed=false;
  const redactReport=createReportRedactor();
  const write=(finalSuccess)=>{
    report.ownership={userIds:[...userIds],phoneHashes:phones.map(hash),ipHashes:ips.map(hash)};
    try {
      fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(redactReport({...report,...(finalSuccess===undefined?{}:{success:finalSuccess})}),null,2));
      if(finalSuccess!==undefined)report.success=finalSuccess;
    } catch {
      report.success=false;report.reportFailure={message:'Report write failed'};
      report.fail=Math.max(1,report.fail||0);
      throw new Error('Local auth report write failed');
    }
  };
  const ownPhone = p=>check(phones.includes(p),'Fixture must belong to this run');
  const saveEnv = (key,value)=>{originalEnv[key]=process.env[key];process.env[key]=value;};
  const names = ['users','customers','barbers','services','barber_working_hours','bookings','admin_accounts','ustara_schema_migrations',
    'registration_phone_limits','pending_registrations','registration_otp_history','registration_security_events','registration_admin_actions',
    'login_attempt_limits','account_session_versions','password_reset_limits','password_reset_requests','password_reset_events',
    'barber_telegram_links','barber_telegram_link_tokens','telegram_bot_state'];
  async function fingerprint() {
    const result={};
    for (const table of names) result[table]=(await control.query(`SELECT count(*)::int AS count,
      md5(coalesce(string_agg(row_data,'' ORDER BY row_data COLLATE "C"),'')) AS fingerprint
      FROM (SELECT to_jsonb(r)::text AS row_data FROM public.${table} r) row_items`)).rows[0];
    return result;
  }
  const schema = async()=> (await control.query(`SELECT md5(coalesce(string_agg(item,'' ORDER BY item COLLATE "C"),'')) AS fingerprint FROM (
    SELECT jsonb_build_object('table',c.relname,'kind',c.relkind,'comment',obj_description(c.oid,'pg_class'),
      'column',a.attname,'position',a.attnum,'type',a.atttypid,'mod',a.atttypmod,'nn',a.attnotnull,
      'default',pg_get_expr(d.adbin,d.adrelid))::text AS item
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public'
    UNION ALL SELECT (to_jsonb(k)-'oid')::text FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    UNION ALL SELECT pg_get_indexdef(i.indexrelid) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') all_items`)).rows[0].fingerprint;
  async function cleanup() {
    await control.query('BEGIN');
    try {
      const ids=(await control.query('SELECT id FROM users WHERE phone=ANY($1::text[]) FOR UPDATE',[phones])).rows.map(r=>r.id);
      check(ids.every(id=>userIds.includes(id)&&!protectedUserIds.has(id)),'Refusing cleanup of an account not recorded from this run');
      report.cleanup.deletedSecurity=await cleanupPhoneSecurity(control,phones,ips,ids);
      for (const table of ['customers','barbers']) await control.query(`DELETE FROM ${table} WHERE user_id=ANY($1::int[])`,[ids]);
      await control.query('DELETE FROM users WHERE id=ANY($1::int[]) AND phone=ANY($2::text[])',[ids,phones]);
      await assertRunSecurityRemoved(control,phones,ips,ids);
      await control.query('COMMIT');
    } catch(e) {await control.query('ROLLBACK');throw e;}
  }
  async function close() {
    if(closed)return;closed=true;
    try {
      if(server)await new Promise(resolve=>server.close(resolve));
      if(baseline){
        await assertTestIdentity(control,target);
        report.cleanup={own_rows_removed:false};
        await cleanup();
        report.cleanup={...report.cleanup,own_rows_removed:true,original_rows_unchanged:JSON.stringify(await fingerprint())===JSON.stringify(baseline),
          admin_unchanged:JSON.stringify((await control.query('SELECT * FROM admin_accounts ORDER BY id')).rows)===JSON.stringify(adminBefore),
          history_unchanged:JSON.stringify((await control.query('SELECT * FROM ustara_schema_migrations ORDER BY version')).rows)===JSON.stringify(historyBefore),
          schema_unchanged:await schema()===schemaBefore};
        check(Object.entries(report.cleanup).filter(([key])=>key!=='deletedSecurity').every(([,value])=>value===true),'Cleanup or original-data invariant failed');
      }
    } catch(error) {
      report.cleanupFailure={message:'Cleanup or preservation verification failed'};
      report.cleanup={...report.cleanup,status:'FAIL'};
      throw new Error('Local auth cleanup failed; inspect the redacted report');
    } finally {
      try {
        try{await control.query('SELECT pg_advisory_unlock_all()');}finally{control.release();await pool.end();}
      } catch(error) {
        report.cleanupFailure={message:'Cleanup connection release failed'};
        throw new Error('Local auth cleanup connection release failed');
      } finally {
        if(savedFetch)global.fetch=savedFetch;
        if(savedConfig)require('dotenv').config=savedConfig;
        if(smsModule&&savedSmsFactory)smsModule.createTestSmsAdapter=savedSmsFactory;
        for(const [key,value] of Object.entries(originalEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
        report.pass=report.cases.filter(c=>c.status==='PASS').length;
        report.fail=report.cases.filter(c=>c.status==='FAIL').length+(report.cleanupFailure?1:0)+(report.reportFailure?1:0);
        write(!report.setupFailure&&!report.cleanupFailure&&!report.reportFailure&&report.fail===0);
      }
    }
  }
  try {
    const identity=(await control.query(`SELECT current_database() AS database,session_user,current_setting('server_version_num') AS version,
      current_setting('data_directory') AS directory,current_setting('port') AS port,host(inet_server_addr()) AS address`)).rows[0];
    const localAddress=target.host.startsWith('/')?identity.address===null:['127.0.0.1','::1'].includes(identity.address);
    check(identity.database==='ustara_test_db'&&identity.session_user===target.sessionUser&&identity.version==='180006'&&localAddress,'Local test PostgreSQL 18.6 identity mismatch');
    const registry=spawnSync('/usr/bin/pg_lsclusters',['--json'],{encoding:'utf8'});
    check(registry.status===0&&JSON.parse(registry.stdout).some(c=>c.running&&c.version==='18'&&c.pgdata===identity.directory&&String(c.port)===identity.port),'Registered local server verification failed');
    report.identity={database:'ustara_test_db',version:'18.6',local:true};
    // Other copies of this module serialize setup/test/cleanup; concurrent HTTP
    // requests within a case still use real independent pool connections.
    check((await control.query("SELECT pg_try_advisory_lock(hashtext(current_database()),hashtext('ustara-local-auth-integration')) AS ok")).rows[0].ok,'Another local auth test run is active');
    baseline=await fingerprint();schemaBefore=await schema();
    adminBefore=(await control.query('SELECT * FROM admin_accounts ORDER BY id')).rows;
    historyBefore=(await control.query('SELECT * FROM ustara_schema_migrations ORDER BY version')).rows;
    for(const row of (await control.query('SELECT id FROM public.users')).rows)protectedUserIds.add(row.id);
    for(let i=0;i<48;i++){await reserveLocalPhone(control,phones);write();}
    for(let i=0;i<16;i++){await reserveLocalIp(control,ips);write();}
    const jwtKey=crypto.randomBytes(48).toString('hex');
    for(const [key,value] of Object.entries({NODE_ENV:'test',OTP_SMS_ADAPTER:'test',OTP_EXPOSE_CODE:'true',OTP_HMAC_KEY:crypto.randomBytes(48).toString('hex'),OTP_HMAC_KEY_ID:'local-auth-test',JWT_SECRET:jwtKey}))saveEnv(key,value);
    redactReport({JWT_SECRET:jwtKey,OTP_HMAC_KEY:process.env.OTP_HMAC_KEY});
    const dbFile=require.resolve('../../db');require.cache[dbFile]={id:dbFile,filename:dbFile,loaded:true,exports:pool};
    smsModule=require('../../services/registrationSms');savedSmsFactory=smsModule.createTestSmsAdapter;
    const factory=savedSmsFactory;
    smsModule.createTestSmsAdapter=(settings)=>{const adapter=factory(settings);return {...adapter,async send(message){ownPhone(message.phone);await adapter.send(message);redactReport({otp:message.code,phone:message.phone});deliveries.set(message.phone,message.code);}};};
    savedConfig=require('dotenv').config;require('dotenv').config=()=>({parsed:{}});
    savedFetch=global.fetch;global.fetch=async()=>{throw new Error('External fetch forbidden in local auth tests');};
    const app=require('../../server');
    server=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
    let currentCase='setup';
    async function call(route,body,{token,ip=0,method='POST',headers={}}={}){
      validateLocalRoute(method,route,true);
      redactReport({request:body,authorization:token,headers});
      if(body?.phone){
        let normalized;
        try{normalized=require('../../utils/registration').normalizePhone(body.phone);}catch{}
        if(normalized)ownPhone(normalized);
      }
      check(Number.isInteger(ip)&&ip>=0&&ip<ips.length,'Only a run-reserved peer IP may be used');
      const data=body===undefined?null:JSON.stringify(body);
      const result=await new Promise((resolve,reject)=>{
        const req=http.request({host:'127.0.0.1',port:server.address().port,localAddress:ips[ip],path:route,method,agent:false,
          headers:{...(data?{'content-type':'application/json','content-length':Buffer.byteLength(data)}:{}),...(token?{authorization:'Bearer '+token}:{}),...headers}},res=>{
          const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{try{resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(Buffer.concat(chunks).toString())});}catch{reject(new Error('Invalid JSON (body suppressed)'));}});
        });req.setTimeout(15000,()=>req.destroy(new Error('Local test HTTP timeout')));req.on('error',reject);req.end(data);
      });
      if(result.status<400&&typeof result.body.token==='string'){
        const claims=require('jsonwebtoken').verify(result.body.token,jwtKey);
        check(!protectedUserIds.has(claims.id),'Pre-existing account JWT cannot enter this run ledger');
        const owned=(await control.query('SELECT id FROM users WHERE id=$1 AND phone=ANY($2::text[])',[claims.id,phones])).rows;
        check(owned.length===1,'Issued account JWT must belong to this run');
        if(!userIds.includes(claims.id))userIds.push(claims.id);
      }
      report.requests.push({case:currentCase,method,endpoint:route,status:result.status,request:'<auth payload suppressed>',response:'<auth payload suppressed>'});write();return result;
    }
    async function scenario(name,work){currentCase=name;const first=report.requests.length;try{await work();report.cases.push({name,status:'PASS',requests:report.requests.length-first});}
      catch(e){report.cases.push({name,status:'FAIL',reason:e.safe?e.message:'Unexpected error (details suppressed)',code:e.code||null});write();throw new Error('Authentication scenario failed: '+name+'; '+(e.safe?e.message:e.code||'unexpected error'));}write();}
    async function shiftRegistration(phone,seconds){ownPhone(phone);await control.query('BEGIN');try{
      await control.query(`UPDATE pending_registrations SET created_at=created_at-$2*interval '1 second',updated_at=updated_at-$2*interval '1 second',
        otp_sent_at=otp_sent_at-$2*interval '1 second',otp_expires_at=otp_expires_at-$2*interval '1 second',
        session_expires_at=session_expires_at-$2*interval '1 second',phone_verified_at=phone_verified_at-$2*interval '1 second',
        completion_expires_at=completion_expires_at-$2*interval '1 second' WHERE phone=$1`,[phone,seconds]);
      await control.query(`UPDATE registration_otp_history SET sent_at=sent_at-$2*interval '1 second',expires_at=expires_at-$2*interval '1 second',
        verified_at=verified_at-$2*interval '1 second',invalidated_at=invalidated_at-$2*interval '1 second' WHERE phone=$1`,[phone,seconds]);
      await control.query("UPDATE registration_phone_limits SET last_sent_at=last_sent_at-$2*interval '1 second' WHERE phone=$1",[phone,seconds]);
      await control.query('COMMIT');}catch(e){await control.query('ROLLBACK');throw e;}}
    async function shiftReset(phone,seconds){ownPhone(phone);await control.query('BEGIN');try{
      await control.query(`UPDATE password_reset_requests SET otp_sent_at=otp_sent_at-$2*interval '1 second',otp_expires_at=otp_expires_at-$2*interval '1 second',
        challenge_expires_at=challenge_expires_at-$2*interval '1 second',verified_at=verified_at-$2*interval '1 second',reset_expires_at=reset_expires_at-$2*interval '1 second' WHERE phone=$1`,[phone,seconds]);
      await control.query("UPDATE password_reset_limits SET last_sent_at=last_sent_at-$2*interval '1 second' WHERE phone=$1",[phone,seconds]);
      await control.query('COMMIT');}catch(e){await control.query('ROLLBACK');throw e;}}
    async function expireLogin(kind,value,seconds){check(kind==='account'?phones.includes(value):ips.includes(value),'Only owned login limit may be aged');
      await control.query(`UPDATE login_attempt_limits SET blocked_until=blocked_until-$3*interval '1 second',last_failed_at=last_failed_at-$3*interval '1 second',
        window_started_at=window_started_at-$3*interval '1 second' WHERE scope='public' AND kind=$1 AND key_hash=$2`,[kind,hash(value),seconds]);}
    async function parallel(label,phone,table,requests){ownPhone(phone);check(['registration_phone_limits','password_reset_limits'].includes(table),'Invalid parallel lock target');
      const holder=await pool.connect();await holder.query('BEGIN');await holder.query(`SELECT phone FROM ${table} WHERE phone=$1 FOR UPDATE`,[phone]);
      const holderPid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const batch=Promise.all(requests.map(f=>f()));batch.catch(()=>{});let pids=[];
      try{for(let i=0;i<70;i++){
        const waits=(await control.query("SELECT pid,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",[application])).rows;
        const graph=new Map(waits.map(r=>[r.pid,r.blockers]));
        const reachesHolder=(pid,seen=new Set())=>pid===holderPid||(!seen.has(pid)&&seen.add(pid)&&(graph.get(pid)||[]).some(b=>reachesHolder(b,new Set(seen))));
        pids=waits.filter(r=>reachesHolder(r.pid)).map(r=>r.pid);
        if(pids.length>=requests.length)break;await new Promise(r=>setTimeout(r,25));
      }}finally{await holder.query('ROLLBACK');holder.release();}
      const results=await batch;check(pids.length>=requests.length,'Independent concurrent PostgreSQL connections not observed');
      report.parallel.push({label,backendPids:pids,statuses:results.map(r=>r.status)});return results;
    }
    return {root,report,pool,control,phones,ips,call,scenario,check:(value,label)=>{check(value,label);report.assertions.push({case:currentCase,check:label,result:'PASS'});},hash,jwtKey,parallel,shiftRegistration,shiftReset,expireLogin,
      otp:p=>deliveries.get(p),smsCount:()=>deliveries.size,close};
  }catch(e){report.setupFailure={reason:e.safe?e.message:'Setup query failed (details suppressed)',code:e.code||null};try{await close();}catch{throw new Error('Local auth setup and cleanup failed; inspect the redacted report');}throw new Error(e.safe?e.message:'Cannot safely prepare local authentication harness; details suppressed');}
}
module.exports={createLocalAuthHarness,check,validateLocalRoute,securityReservationLimitation,createReportRedactor,phoneInUse,reserveLocalPhone,reserveLocalIp,cleanupPhoneSecurity,assertRunSecurityRemoved};
