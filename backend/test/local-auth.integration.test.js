// Deliberately NOT part of the ordinary test-database runner. Explicit write opt-in.
const { test } = require('node:test');
const jwt = require('jsonwebtoken');
const { createLocalAuthHarness } = require('./helpers/localAuth');
const enabled = process.env.USTARA_LOCAL_AUTH_WRITE_TESTS === 'I_AUTHORIZE_TEST_DATA';
test('local ustara_test_db authentication API (real PostgreSQL, scoped cleanup)', { skip: !enabled }, async (t) => {
  let h;
  try { h=await createLocalAuthHarness(); } catch { throw new Error('Local auth harness setup failed; no raw credential-bearing error is printed'); }
  t.after(async()=>{try{await h.close();}catch{throw new Error('Scoped test cleanup or preservation verification failed; see private report');}});
  const {check,call,control:q,phones:p}=h;
  const reg='/api/auth/registration', reset='/api/auth/password-reset';
  const password='LocalAuthPass123', newer='LocalAuthChanged456';
  const states={};
  const row=async(table,phone)=>(await q.query(`SELECT * FROM ${table} WHERE phone=$1`,[phone])).rows[0];
  const count=async(table,phone)=>Number((await q.query(`SELECT count(*) AS n FROM ${table} WHERE phone=$1`,[phone])).rows[0].n);
  const wrong=code=>code==='00000'?'00001':'00000';
  const start=(phone,role='customer',extra={})=>call(reg+'/start',{phone,role,password,...(role==='barber'?{specialty:'stylist'}:{}),...extra});
  const verify=(s,otp=s.body.testOtp)=>call(reg+'/verify',{sessionToken:s.body.sessionToken,otp});
  const complete=s=>call(reg+'/complete',{sessionToken:s.body.sessionToken,firstName:'Ustara',lastName:'Test'+h.report.run.replace(/[0-9]/g,'a')});
  async function account(phone,role='customer'){
    const s=await start(phone,role);check(s.status===201,'Account fixture registration start');
    check((await verify(s)).status===200,'Account fixture verify');const c=await complete(s);check(c.status===201,'Account fixture complete');return c;
  }
  async function caseTest(name,work){await t.test(name,()=>h.scenario(name,work));
    // node:test subtest failures do not throw by themselves. Stop dependent tests.
    check(h.report.cases.at(-1)?.status==='PASS','Stop after failed authentication scenario; cleanup still runs');}

  await caseTest('registration input validation rejects phone, role, password and barber specialty',async()=>{
    for(const body of [{phone:'invalid',role:'customer',password},{phone:p[0],role:'admin',password},
      {phone:p[0],role:'customer',password:'12345678'},{phone:p[1],role:'barber',password,specialty:''},
      {phone:p[1],role:'barber',password,specialty:'other'}]){
      check((await call(reg+'/start',body)).status===400,'Invalid start must return 400');
    }
    check(await count('pending_registrations',p[0])===0&&await count('users',p[0])===0,'Validation leaves no account or pending row');
  });
  await caseTest('start normalizes phone, stores only hashes, TTL 180s and no premature profile',async()=>{
    const phone=p[0];states.customerStart=await start(phone.slice(4));const s=states.customerStart;
    check(s.status===201&&s.body.resendAfter===180,'Start returns 201 and 180-second resend interval');
    const pending=await row('pending_registrations',phone);
    check(pending&&pending.session_token_hash===h.hash(s.body.sessionToken),'Only hashed session token stored');
    check(pending.password_hash!==password&&pending.otp_hmac_hash!==s.body.testOtp,'No plaintext password or OTP stored');
    check(+pending.otp_expires_at-+pending.otp_sent_at===180000,'OTP TTL is exactly 180 seconds');
    check(await count('users',phone)===0&&await count('registration_otp_history',phone)===1,'Only pending/history exist before completion');
  });
  await caseTest('resend cooldown and wrong OTP persist without rollback',async()=>{
    const s=states.customerStart;
    const retry=await call(reg+'/resend',{sessionToken:s.body.sessionToken});
    check(retry.status===429&&retry.body.code==='resend_too_soon'&&Number(retry.headers['retry-after'])>0,'Immediate resend is throttled');
    const invalid=await verify(s,wrong(s.body.testOtp));check(invalid.status===400&&invalid.body.code==='invalid_otp','Wrong OTP rejected');
    check((await row('pending_registrations',p[0])).otp_failed_attempts===1,'Wrong attempt committed to PostgreSQL');
  });
  await caseTest('verify and complete create canonical customer/profile atomically; tokens cannot replay',async()=>{
    const s=states.customerStart;check((await verify(s)).status===200,'Correct OTP accepted');
    const pending=await row('pending_registrations',p[0]);check(+pending.completion_expires_at-+pending.phone_verified_at===900000,'Completion window exactly 15 minutes');
    check((await call(reg+'/resend',{sessionToken:s.body.sessionToken})).status===409,'Verified session cannot resend');
    const c=await complete(s);states.customer=c;check(c.status===201,'Complete returns 201');
    const user=await row('users',p[0]);const profile=(await q.query('SELECT * FROM customers WHERE user_id=$1',[user.id])).rows[0];
    check(profile.first_name==='Ustara'&&profile.last_name.startsWith('Test'),'Split names saved');
    const claims=jwt.verify(c.body.token,h.jwtKey);check(claims.id===user.id&&claims.profileId===profile.id&&claims.role==='customer','JWT account/profile/role identity correct');
    check(await count('pending_registrations',p[0])===0&&await count('registration_otp_history',p[0])===1,'Pending consumed; history retained');
    check((await complete(s)).status===401&&(await verify(s)).status===401,'Used registration token cannot replay');
    check((await start(p[0])).status===409&&await count('users',p[0])===1,'Duplicate phone account rejected');
  });
  await caseTest('barber registration saves mandatory specialty and linked profile',async()=>{
    states.barber=await account(p[1],'barber');
    const result=(await q.query('SELECT b.specialty,b.user_id,u.role FROM barbers b JOIN users u ON u.id=b.user_id WHERE u.phone=$1',[p[1]])).rows[0];
    check(result.specialty==='stylist'&&result.role==='barber','Specialty persisted on real barber profile');
  });
  await caseTest('OTP expiry, eligible resend and old issuance invalidation',async()=>{
    const s=await start(p[2]);check(s.status===201,'Expiry fixture start');await h.shiftRegistration(p[2],181);
    check((await verify(s)).body.code==='otp_expired','Expired OTP rejected against actual database clock');
    const sent=await call(reg+'/resend',{sessionToken:s.body.sessionToken});check(sent.status===200,'Resend accepted after 180 seconds');
    check((await verify(s)).body.code==='invalid_otp','Old registration OTP invalidated');
    check((await verify(s,sent.body.testOtp)).status===200,'Fresh OTP accepted');
    await h.shiftRegistration(p[2],901);check((await complete(s)).status===410,'Expired profile completion window rejected');
  });
  await caseTest('five wrong OTPs permanently block registration',async()=>{
    const s=await start(p[3]);check(s.status===201,'Block fixture start');
    for(let n=1;n<=5;n++)check((await verify(s,wrong(s.body.testOtp))).status===(n===5?423:400),'Wrong-attempt threshold response');
    const limit=await row('registration_phone_limits',p[3]);
    check(limit.block_reason==='otp_attempts'&&(await q.query("SELECT blocked_until='infinity'::timestamptz AS permanent FROM registration_phone_limits WHERE phone=$1",[p[3]])).rows[0].permanent,'Permanent OTP block stored');
    check((await start(p[3])).status===423,'Restart cannot bypass permanent block');
  });
  await caseTest('three SMS sends then one-hour and repeat five-hour blocks',async()=>{
    const s=await start(p[4]);check(s.status===201,'SMS budget fixture start');
    for(let i=0;i<2;i++){await h.shiftRegistration(p[4],181);check((await call(reg+'/resend',{sessionToken:s.body.sessionToken})).status===200,'Eligible SMS resend');}
    check((await call(reg+'/resend',{sessionToken:s.body.sessionToken})).status===423,'Fourth SMS blocked');
    let limit=await row('registration_phone_limits',p[4]);check(+limit.blocked_until-+limit.blocked_at===3600000,'Initial SMS block exactly one hour');
    await q.query("UPDATE registration_phone_limits SET blocked_at=blocked_at-interval '61 minutes',blocked_until=blocked_until-interval '61 minutes' WHERE phone=$1",[p[4]]);
    for(let i=0;i<3;i++){if(i)await h.shiftRegistration(p[4],181);check((await call(reg+'/resend',{sessionToken:s.body.sessionToken})).status===200,'Expired block reopens SMS budget');}
    check((await call(reg+'/resend',{sessionToken:s.body.sessionToken})).status===423,'Repeat fourth send blocked');
    limit=await row('registration_phone_limits',p[4]);check(+limit.blocked_until-+limit.blocked_at===18000000,'Repeat SMS block exactly five hours');
  });
  await caseTest('concurrent start, verify and complete use separate real database connections',async()=>{
    const phone=p[5];
    // Pre-create only a run-owned phone-limit fixture so both starts can be held.
    await q.query('INSERT INTO registration_phone_limits(phone) VALUES($1)',[phone]);
    let results=await h.parallel('parallel start',phone,'registration_phone_limits',[()=>start(phone),()=>start(phone)]);
    check(results.map(r=>r.status).sort().join(',')==='201,409','Exactly one concurrent start succeeds');const s=results.find(r=>r.status===201);
    results=await h.parallel('parallel verify',phone,'registration_phone_limits',[()=>verify(s),()=>verify(s)]);
    check(results.map(r=>r.status).sort().join(',')==='200,409','Only one verify transition');
    results=await h.parallel('parallel complete',phone,'registration_phone_limits',[()=>complete(s),()=>complete(s)]);
    check(results.map(r=>r.status).sort().join(',')==='201,401'&&await count('users',phone)===1,'Only one complete/account commit');
  });
  await caseTest('JWT signing failure rolls back actual user/profile creation without schema changes',async()=>{
    const s=await start(p[6]);check(s.status===201&&(await verify(s)).status===200,'Rollback fixture verified');
    const original=jwt.sign;jwt.sign=()=>{throw new Error('Injected test-only signing failure');};let failed;
    try{failed=await complete(s);}finally{jwt.sign=original;}
    check(failed.status===500&&await count('users',p[6])===0,'Signing failure leaves no partial account');
    check((await row('pending_registrations',p[6])).phone_verified_at,'Pending remains verified after rollback');
    check((await complete(s)).status===201,'Same session can complete after fault removal');
  });
  await caseTest('customer/barber login, role identity and authenticated profile middleware',async()=>{
    for(const [phone,role] of [[p[0],'customer'],[p[1],'barber']]){
      const result=await call(`/api/${role}s/login`,{phone,password});check(result.status===200,'Valid role login 200');
      const user=await row('users',phone),claims=jwt.verify(result.body.token,h.jwtKey);
      check(claims.id===user.id&&claims.role===role&&claims.profileId===result.body[role].id,'Login JWT role/profile identity matches PostgreSQL');
      check((await call(`/api/${role}s/me`,undefined,{method:'GET',token:result.body.token})).status===200,'JWT accepted by actual auth middleware');
      states[role+'Login']=result;
    }
    check((await call('/api/barbers/me',undefined,{method:'GET',token:states.customerLogin.body.token})).status===403,'Customer cannot use barber-only profile');
    check((await call('/api/customers/me',undefined,{method:'GET',token:'invalid'})).status===401,'Invalid JWT rejected');
    check((await call('/api/customers/login',{phone:p[1],password})).status===401,'Role mismatch cannot issue customer JWT');
  });
  await caseTest('wrong password and nonexistent account share generic login response',async()=>{
    const wrongLogin=await call('/api/customers/login',{phone:p[0],password:'IncorrectPass123'});
    const unknown=await call('/api/customers/login',{phone:p[10],password:'IncorrectPass123'});
    check(wrongLogin.status===401&&unknown.status===401&&wrongLogin.body.message===unknown.body.message,'No account enumeration through login error');
  });
  await caseTest('account brute force escalates 1/3/5 minutes then success resets counters',async()=>{
    check((await call('/api/customers/login',{phone:p[0],password},{ip:5})).status===200,'Correct login clears prior scenario failures before escalation');
    for(const [tier,minutes] of [1,3,5,5].entries()){
      for(let n=0;n<5;n++)check((await call('/api/customers/login',{phone:p[0],password:'IncorrectPass123'},{ip:tier+1})).status===(n===4?429:401),'Five failed passwords trigger account block');
      const limit=(await q.query("SELECT * FROM login_attempt_limits WHERE scope='public' AND kind='account' AND key_hash=$1",[h.hash(p[0])])).rows[0];
      check(+limit.blocked_until-+limit.last_failed_at===minutes*60000,'Account block escalation duration');
      check((await call('/api/customers/login',{phone:p[0],password},{ip:tier+1})).status===429,'Correct password cannot bypass active block');
      await h.expireLogin('account',p[0],minutes*60+1);
    }
    check((await call('/api/customers/login',{phone:p[0],password},{ip:5})).status===200,'Expired block automatically permits correct login');
    const limit=(await q.query("SELECT failed_count,penalty_level,blocked_until FROM login_attempt_limits WHERE scope='public' AND kind='account' AND key_hash=$1",[h.hash(p[0])])).rows[0];
    check(limit.failed_count===0&&limit.penalty_level===0&&limit.blocked_until===null,'Successful login clears account attempts/penalties');
  });
  await caseTest('shared peer failures do not block other phones; forwarding headers stay untrusted',async()=>{
    for(let n=0;n<10;n++)check((await call('/api/customers/login',{phone:p[10+n],password:'IncorrectPass123'},{ip:6})).status===401,'Distinct phones keep independent budgets');
    check((await call('/api/customers/login',{phone:p[0],password},{ip:6,headers:{'x-forwarded-for':'198.51.100.1'}})).status===200,'Another phone can log in on the same peer');
    const limit=(await q.query("SELECT * FROM login_attempt_limits WHERE scope='public' AND kind='ip' AND key_hash=$1",[h.hash(JSON.stringify([p[10],h.ips[6]]))])).rows[0];
    check(limit.failed_count===1,'Source key uses canonical phone and direct peer');
  });
  await caseTest('reset start hides account existence and sends only through test adapter for known phone',async()=>{
    const before=h.smsCount();const known=await call(reset+'/start',{phone:p[0]});const unknown=await call(reset+'/start',{phone:p[40]});
    check(known.status===200&&unknown.status===200&&Object.keys(known.body).sort().join(',')===Object.keys(unknown.body).sort().join(','),'Known/unknown reset response symmetry');
    check(h.smsCount()===before&&!h.otp(p[40]),'Unknown reset does not invoke SMS send');
    // Customer already had registration SMS, so delivery map size stays constant.
    check(!('testOtp' in known.body),'Reset API never exposes OTP');
    const pending=await row('password_reset_requests',p[0]);check(pending.challenge_token_hash===h.hash(known.body.challengeToken),'Reset challenge stored hashed');
    states.resetStart=known;
  });
  await caseTest('reset wrong OTP, expiry, resend cooldown and old OTP invalidation',async()=>{
    const s=states.resetStart,challengeToken=s.body.challengeToken,old=h.otp(p[0]);
    check((await call(reset+'/resend',{challengeToken})).status===429,'Reset immediate resend throttled');
    check((await call(reset+'/verify',{challengeToken,otp:wrong(old)})).status===400,'Wrong reset OTP rejected');
    check((await row('password_reset_requests',p[0])).otp_failed_attempts===1,'Reset wrong attempt durably stored');
    await h.shiftReset(p[0],181);check((await call(reset+'/verify',{challengeToken,otp:old})).body.code==='otp_expired','Expired reset OTP rejected');
    check((await call(reset+'/resend',{challengeToken})).status===200,'Eligible reset resend accepted');
    if(h.otp(p[0])!==old)check((await call(reset+'/verify',{challengeToken,otp:old})).body.code==='invalid_otp','Previous reset code rejected');
    const verified=await call(reset+'/verify',{challengeToken,otp:h.otp(p[0])});check(verified.status===200,'Correct reset OTP accepted');states.resetVerified=verified;
    const pending=await row('password_reset_requests',p[0]);check(pending.reset_token_hash===h.hash(verified.body.resetToken)&&pending.challenge_token_hash===null,'Verify rotates hashed capability and consumes challenge');
    check((await call(reset+'/verify',{challengeToken,otp:h.otp(p[0])})).status===401,'Verified challenge cannot replay');
  });
  await caseTest('parallel password reset complete is atomic, token single-use, old JWT revoked and new password works',async()=>{
    const resetToken=states.resetVerified.body.resetToken;
    const results=await h.parallel('parallel reset complete',p[0],'password_reset_limits',[
      ()=>call(reset+'/complete',{resetToken,password:newer}),()=>call(reset+'/complete',{resetToken,password:newer})]);
    check(results.map(r=>r.status).sort().join(',')==='200,401','Exactly one reset completion succeeds');
    check(await count('password_reset_requests',p[0])===0,'Reset capability consumed');
    check((await call(reset+'/complete',{resetToken,password:newer})).status===401,'Reset token cannot replay');
    check((await call('/api/customers/me',undefined,{method:'GET',token:states.customerLogin.body.token})).status===401,'Old JWT rejected after reset');
    check((await call('/api/customers/login',{phone:p[0],password},{ip:7})).status===401,'Old password rejected');
    const login=await call('/api/customers/login',{phone:p[0],password:newer},{ip:7});check(login.status===200,'New password login succeeds');
    check(jwt.verify(login.body.token,h.jwtKey).sessionVersion===1,'New login uses incremented session version');
    check((await call('/api/customers/me',undefined,{method:'GET',token:login.body.token})).status===200,'New JWT accepted');
  });
  await caseTest('expired challenge/reset token cannot change password; barber reset also revokes old JWT',async()=>{
    await account(p[7]);let s=await call(reset+'/start',{phone:p[7]});check(s.status===200,'Expiry reset start');
    await h.shiftReset(p[7],1801);check((await call(reset+'/verify',{challengeToken:s.body.challengeToken,otp:h.otp(p[7])})).status===401,'Expired challenge denied');
    s=await call(reset+'/start',{phone:p[7]});check(s.status===200,'Reset restart after aged cooldown');
    let v=await call(reset+'/verify',{challengeToken:s.body.challengeToken,otp:h.otp(p[7])});check(v.status===200,'Reset expiry fixture verified');
    const before=(await row('users',p[7])).password;await h.shiftReset(p[7],301);
    check((await call(reset+'/complete',{resetToken:v.body.resetToken,password:newer})).status===401,'Expired reset token rejected');
    check((await row('users',p[7])).password===before,'Expired reset does not mutate password');
    s=await call(reset+'/start',{phone:p[1]});check(s.status===200,'Barber reset start');
    v=await call(reset+'/verify',{challengeToken:s.body.challengeToken,otp:h.otp(p[1])});check(v.status===200,'Barber reset verify');
    check((await call(reset+'/complete',{resetToken:v.body.resetToken,password:newer})).status===200,'Barber reset complete');
    check((await call('/api/barbers/me',undefined,{method:'GET',token:states.barberLogin.body.token})).status===401,'Old barber JWT revoked');
    check((await call('/api/barbers/login',{phone:p[1],password:newer},{ip:8})).status===200,'Barber new password login');
  });
  await caseTest('five wrong reset OTP attempts create permanent reset-only block',async()=>{
    await account(p[8]);const s=await call(reset+'/start',{phone:p[8]});check(s.status===200,'Reset block fixture start');
    for(let n=1;n<=5;n++)check((await call(reset+'/verify',{challengeToken:s.body.challengeToken,otp:wrong(h.otp(p[8]))})).status===(n===5?423:400),'Reset OTP threshold response');
    check((await q.query("SELECT blocked_until='infinity'::timestamptz AS permanent FROM password_reset_limits WHERE phone=$1",[p[8]])).rows[0].permanent,'Permanent reset block stored');
    check(await count('password_reset_requests',p[8])===0,'Permanently blocked reset capability removed');
    check((await call('/api/customers/login',{phone:p[8],password},{ip:9})).status===200,'Reset restriction does not corrupt existing login account');
  });
  console.log('Local auth evidence: '+h.root);
});
