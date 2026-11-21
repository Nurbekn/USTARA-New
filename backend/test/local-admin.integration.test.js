const {test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const jwt=require('jsonwebtoken');
const {createLocalBarberHarness}=require('./helpers/localBarber');
const enabled=process.env.USTARA_LOCAL_ADMIN_WRITE_TESTS==='I_AUTHORIZE_TEST_DATA';
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const redact=value=>Array.isArray(value)?value.map(redact):value&&typeof value==='object'
 ?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,/^(login|password|token|phone|first_name|last_name)$/i.test(key)?'<redacted>':redact(item)])):value;

test('local ustara_test_db admin API: ten core security/approval cases',{skip:!enabled},async(t)=>{
 // Read the configured credentials privately. They never enter reports/argv.
 const config={...require('dotenv').parse(fs.readFileSync(path.resolve(__dirname,'../.env'))),...process.env};
 if(!config.ADMIN_LOGIN||!config.ADMIN_PASSWORD)throw new Error('Configured admin credentials are required (values suppressed)');
 const oldFlag=process.env.USTARA_LOCAL_BARBER_WRITE_TESTS;
 process.env.USTARA_LOCAL_BARBER_WRITE_TESTS='I_AUTHORIZE_TEST_DATA';let h;
 try{h=await createLocalBarberHarness();}catch{throw new Error('Cannot safely prepare local admin integration harness');}
 finally{if(oldFlag===undefined)delete process.env.USTARA_LOCAL_BARBER_WRITE_TESTS;else process.env.USTARA_LOCAL_BARBER_WRITE_TESTS=oldFlag;}
 h.report.module='Admin API integration';h.report.dependencies.telegram='not invoked';
 h.report.adminLogin={credentials:'configured privately; values suppressed',signingKey:'process-only test key',singleton:'existing DB row read, never modified'};
 const push=h.report.requests.push.bind(h.report.requests);h.report.requests.push=(...items)=>push(...items.map(redact));
 const oldEnv={ADMIN_LOGIN:process.env.ADMIN_LOGIN,ADMIN_PASSWORD:process.env.ADMIN_PASSWORD};
 let ownedLimiterKeys=[];
 t.after(async()=>{
  let cleanupError=false;
  try{
   await h.control.query('BEGIN');let count=0;
   try{for(const row of ownedLimiterKeys){
     const result=await h.control.query('DELETE FROM login_attempt_limits WHERE scope=$1 AND kind=$2 AND key_hash=$3 RETURNING kind',['admin',row.kind,row.hash]);count+=result.rowCount;
    }await h.control.query('COMMIT');
   }catch(e){await h.control.query('ROLLBACK');throw e;}
   h.report.adminLimiterCleanup={deleted:count,onlyInitiallyAbsentExactPrimaryKeys:true};
   for(const row of ownedLimiterKeys){const result=await h.control.query('SELECT 1 FROM login_attempt_limits WHERE scope=$1 AND kind=$2 AND key_hash=$3',['admin',row.kind,row.hash]);
    if(result.rowCount)throw new Error('Run-owned limiter row remains');}
  }catch{cleanupError=true;}
  try{await h.close();}catch{cleanupError=true;}
  finally{for(const [key,value]of Object.entries(oldEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  if(cleanupError)throw new Error('Exact-key admin test cleanup or fingerprint preservation failed; private report retained');
 });
 const check=h.check,q=h.control;
 const keys=[{kind:'account',hash:digest('singleton-admin')},{kind:'ip',hash:digest('127.0.0.1')}];
 for(const row of keys){const result=await q.query('SELECT 1 FROM login_attempt_limits WHERE scope=$1 AND kind=$2 AND key_hash=$3',['admin',row.kind,row.hash]);
  check(result.rowCount===0,'Existing admin limiter row must not be changed; setup refuses if present');}
 const sessions=await q.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name<>$1",['ustara_booking_'+h.report.run]);
 check(sessions.rows[0].n===0,'No other backend sessions may race with shared singleton-admin login limits');
 ownedLimiterKeys=keys;
 process.env.ADMIN_LOGIN=config.ADMIN_LOGIN;process.env.ADMIN_PASSWORD=config.ADMIN_PASSWORD;
 const customer=await h.person('customer'),barber=await h.person('barber',false);
 const approve=await h.person('barber',false),reject=await h.person('barber',false);
 let admin;
 const status=async id=>(await q.query('SELECT verification_status FROM barbers WHERE id=$1',[id])).rows[0]?.verification_status;
 const moderate=(id,value,actor)=>h.call('PATCH',`/api/barbers/${id}/verify`,{status:value},actor);
 async function scenario(name,work,required=false){await t.test(name,()=>h.scenario(name,work));
  if(required)check(h.report.cases.at(-1)?.status==='PASS','Required admin login failed; dependent cases stopped');}

 await scenario('valid configured admin login issues a real signed two-hour JWT',async()=>{
  const result=await h.call('POST','/api/admin/login',{login:config.ADMIN_LOGIN,password:config.ADMIN_PASSWORD});
  check(result.status===200&&result.body.role==='admin'&&typeof result.body.token==='string','Configured login returns 200 and admin JWT');
  const claims=jwt.verify(result.body.token,process.env.JWT_SECRET);
  check(claims.role==='admin'&&claims.id===1&&claims.exp-claims.iat===7200,'JWT has actual singleton ID/admin role/two-hour TTL');admin={token:result.body.token};
  check((await q.query('SELECT count(*)::int AS n FROM admin_accounts WHERE id=1 AND is_active')).rows[0].n===1,'Existing active singleton remains present');
 },true);
 await scenario('incorrect admin password is rejected without issuing JWT',async()=>{
  let wrong;do{wrong=crypto.randomBytes(32).toString('hex');}while(wrong===config.ADMIN_PASSWORD);
  const result=await h.call('POST','/api/admin/login',{login:config.ADMIN_LOGIN,password:wrong});
  check(result.status===401&&!('token'in result.body),'Wrong password returns 401 without token');
 });
 await scenario('admin JWT can access actual protected pending-barber list',async()=>{
  const result=await h.call('GET','/api/barbers/pending',undefined,admin);
  check(result.status===200&&Array.isArray(result.body)&&result.body.some(b=>b.id===approve.profileId)&&result.body.some(b=>b.id===reject.profileId),'Admin sees own test pending applications');
 });
 await scenario('customer JWT cannot access admin-only pending applications',async()=>{
  check((await h.call('GET','/api/barbers/pending',undefined,customer)).status===403,'Customer receives 403');
 });
 await scenario('barber JWT cannot access admin-only pending applications',async()=>{
  check((await h.call('GET','/api/barbers/pending',undefined,barber)).status===403,'Barber receives 403');
 });
 await scenario('missing JWT cannot access admin-only pending applications',async()=>{
  check((await h.call('GET','/api/barbers/pending')).status===401,'No token receives 401');
 });
 await scenario('admin approves only the explicitly created pending test barber',async()=>{
  h.owned('barbers',approve.profileId);const result=await moderate(approve.profileId,'approved',admin);
  check(result.status===200&&result.body.barber.id===approve.profileId&&await status(approve.profileId)==='approved','Approval committed to correct test profile');
  check(await status(reject.profileId)==='pending','Other test application unchanged by approval');
 });
 await scenario('admin rejects another explicitly created pending test barber',async()=>{
  h.owned('barbers',reject.profileId);const result=await moderate(reject.profileId,'rejected',admin);
  check(result.status===200&&result.body.barber.id===reject.profileId&&await status(reject.profileId)==='rejected','Rejection committed to correct test profile');
  check(await status(approve.profileId)==='approved','Earlier approved test profile remains approved');
 });
 await scenario('nonexistent barber ID and invalid approval status do not mutate applications',async()=>{
  const missing=2147483646;check((await q.query('SELECT 1 FROM barbers WHERE id=$1',[missing])).rowCount===0,'Missing ID actually absent');
  check((await moderate(missing,'approved',admin)).status===404,'Unknown barber ID returns 404');
  check((await moderate(barber.profileId,'confirmed',admin)).status===400,'Booking status cannot be used as barber approval status');
  check(await status(barber.profileId)==='pending','Invalid moderation requests leave test application unchanged');
 });
 await scenario('non-admin customer and barber cannot perform approval actions',async()=>{
  check((await moderate(barber.profileId,'approved',customer)).status===403,'Customer cannot approve');
  check((await moderate(barber.profileId,'rejected',barber)).status===403,'Barber cannot approve/reject own application');
  check(await status(barber.profileId)==='pending','Unauthorized operations leave test application pending');
 });
 console.log('Admin evidence: '+h.root);
});
