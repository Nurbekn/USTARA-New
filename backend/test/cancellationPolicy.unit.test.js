const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
const { createCancellationPolicyHandlers, parsePolicy } = require('../controllers/cancellationPolicyController');
const { createBookingStatusService, BookingStatusError } = require('../services/bookingStatusService');
const rows = r => ({ rows: r, rowCount: r.length });
function response() { return { statusCode: 200, headers: {}, status(v) {this.statusCode=v;return this},set(k,v) {this.headers[k]=v;return this}, json(body) {this.body=body;return this} }; }
const barber = { role: 'barber', profileId: 2 }, customer = { role: 'customer', profileId: 1 };

test('policy validates strict bounds, types and missing/unknown fields', () => {
  for (const value of [null,[],{}, {cutoff_minutes:-1},{cutoff_minutes:10081},{cutoff_minutes:'60'},
    {cutoff_minutes:1.5},{cutoff_minutes:NaN},{cutoff_minutes:30,extra:3},
    {cutoff_minutes:0,text:'x'.repeat(281)}]) assert.equal(parsePolicy(value),null);
  assert.deepEqual(parsePolicy({cutoff_minutes:null,text:'  '}),{cutoff_minutes:null,text:null});
  assert.deepEqual(parsePolicy({cutoff_minutes:0,text:' a '}),{cutoff_minutes:0,text:'a'});
  assert.deepEqual(parsePolicy({cutoff_minutes:10080}),{cutoff_minutes:10080,text:null});
});

test('only the authenticated barber can set their own policy; no fees accepted', async () => {
  const calls=[];
  const db={async query(sql,args){calls.push({sql,args});return rows([{cancellation_cutoff_minutes:60,cancellation_policy_text:'Bir soat oldin'}]);}};
  const handlers=createCancellationPolicyHandlers(db);
  const forbidden=response();await handlers.update({user:customer,body:{cutoff_minutes:60}},forbidden);assert.equal(forbidden.statusCode,403);assert.equal(calls.length,0);
  const invalid=response();await handlers.update({user:barber,body:{cutoff_minutes:60,fee:12000}},invalid);assert.equal(invalid.statusCode,400);assert.equal(calls.length,0);
  const good=response();await handlers.update({user:barber,body:{cutoff_minutes:60,text:'Bir soat oldin'}},good);
  assert.equal(good.statusCode,200);assert.deepEqual(good.body,{cutoff_minutes:60,text:'Bir soat oldin',fee:0});
  assert.deepEqual(calls[0].args,[60,'Bir soat oldin',2]);assert.match(calls[0].sql,/WHERE id=\$3/);
  const fetched=response();await handlers.mine({user:barber},fetched);
  assert.deepEqual(fetched.body,good.body);assert.deepEqual(calls[1].args,[2]);
});

test('public policy is limited to approved active barber, with no PII', async () => {
  const db={query:async(sql,args)=>{assert.match(sql,/verification_status='approved'/);assert.match(sql,/deactivated_at IS NULL/);assert.deepEqual(args,[2]);return rows([{cancellation_cutoff_minutes:null,cancellation_policy_text:null}]);}};
  const publicRead=createCancellationPolicyHandlers(db).publicRead;
  const ok=response();await publicRead({params:{id:'2'}},ok);assert.deepEqual(ok.body,{cutoff_minutes:null,text:null,fee:0});
  const invalid=response();await publicRead({params:{id:'notid'}},invalid);assert.equal(invalid.statusCode,404);
});

function bookingFixture({now,cutoff,role='customer',status='confirmed',startingAt='2030-01-07T05:00:00Z'}={}) {
  const calls=[],booking={id:3,barber_id:2,customer_id:1,service_id:4,status,booking_time:startingAt,duration_minutes:30,cancellation_cutoff_minutes:cutoff};
  let active=false,finished=false;
  const client={async query(sql,args=[]){calls.push(sql);
    if(sql==='BEGIN'){active=true;return rows([]);}
    if(sql==='COMMIT'||sql==='ROLLBACK'){finished=true;return rows([]);}
    if(sql.startsWith('SET LOCAL')||sql.includes('pg_advisory_xact_lock'))return rows([]);
    if(sql.startsWith('SELECT barber_id FROM bookings'))return rows([booking]);
    if(sql.startsWith('SELECT bookings.id'))return rows([booking]);
    if(sql.startsWith('SELECT clock_timestamp()'))return rows([{now}]);
    if(sql.startsWith('UPDATE bookings SET status')){booking.status=args[0];return rows([{...booking}]);}
    throw Error('Unexpected SQL: '+sql);
  },release(){assert.ok(active&&finished,'must terminate transaction before connection release');}};
  return { calls, booking, pool:{connect:async()=>client}, role };
}
const T=Date.parse('2030-01-07T05:00:00Z');
test('customer cancellation deadline is enforced using database clock and snapshot; rollback on rejection',async()=>{
  for(const offset of [60,45,0]){
    const f=bookingFixture({now:new Date(T-offset*60000).toISOString(),cutoff:60});
    const service=createBookingStatusService({pool:f.pool});
    await assert.rejects(service.update(3,'cancelled',customer), e=>e instanceof BookingStatusError && e.code==='cancellation_deadline_passed'&&e.status===409);
    assert.equal(f.booking.status,'confirmed');assert.ok(f.calls.includes('ROLLBACK'));
    assert.equal(f.calls.some(s=>s.startsWith('UPDATE bookings')),false);
  }
  const early=bookingFixture({now:new Date(T-61*60000).toISOString(),cutoff:60});
  assert.equal((await createBookingStatusService({pool:early.pool}).update(3,'cancelled',customer)).status,'cancelled');
  assert.ok(early.calls.includes('COMMIT'));
});

test('legacy bookings retain unrestricted terms, barber can cancel and replay stays idempotent',async()=>{
  const old=bookingFixture({now:new Date(T+60000).toISOString(),cutoff:null});
  assert.equal((await createBookingStatusService({pool:old.pool}).update(3,'cancelled',customer)).status,'cancelled');
  const barberCase=bookingFixture({now:new Date(T-30*60000).toISOString(),cutoff:60});
  assert.equal((await createBookingStatusService({pool:barberCase.pool}).update(3,'cancelled',barber)).status,'cancelled');
  const replay=bookingFixture({now:new Date(T+86400000).toISOString(),cutoff:60,status:'cancelled'});
  assert.equal((await createBookingStatusService({pool:replay.pool}).update(3,'cancelled',customer)).replayed,true);
  assert.equal(replay.calls.some(s=>s.startsWith('UPDATE bookings')),false);
});

test('forward migration snapshots once at insertion and registers order, without altering legacy rows',()=>{
  const dir=path.join(__dirname,'../database');
  const sql=fs.readFileSync(path.join(dir,'migrations/20261201_cancellation_policy.sql'),'utf8');
  assert.match(sql,/BEFORE INSERT ON bookings/); assert.match(sql,/INTO NEW\.cancellation_cutoff_minutes/);
  assert.doesNotMatch(sql,/UPDATE bookings SET cancellation_cutoff_minutes/);
  assert.match(sql,/INSERT INTO ustara_schema_migrations\(version\)/);
  assert.match(fs.readFileSync(path.join(dir,'bootstrap.sql'),'utf8'),/20261201_cancellation_policy\.sql/);
});
