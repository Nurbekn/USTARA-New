'use strict';
// Explicitly opt-in read-only staging audit. Does not modify bookings, users,
// migrations or messages. Requires a dedicated local, unprivileged test role.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {testTarget,assertTestConnection}=require('./helpers/testDatabaseTarget');
const enabled=process.env.NODE_ENV==='test' &&
 process.env.USTARA_SMART_BOOKING_DB_AUDIT==='I_AUTHORIZE_READ_ONLY_TEST' &&
 Boolean(process.env.USTARA_TEST_DATABASE_URL);

test('v28 staging PostgreSQL: v27 migration, overlap constraints and consent isolation',
 {skip:!enabled,timeout:30000},async()=>{
  const target=testTarget(process.env.USTARA_TEST_DATABASE_URL,'USTARA Smart Booking staging',['ustara_account_test']);
  // Import only after opt-in. Missing pg package must not break offline tests.
  const {Pool}=require('pg');
  const db=new Pool({connectionString:process.env.USTARA_TEST_DATABASE_URL,
   ssl:false,max:1,application_name:'ustara_smart_booking_read_only_audit',
   connectionTimeoutMillis:5000,statement_timeout:12000,
   options:'-c search_path=public -c default_transaction_read_only=on'});
  let c;
  try{
   c=await db.connect();
   await assertTestConnection(c,target,'ustara_account_test');
   const schema=await c.query('SELECT current_schema() AS name, current_setting(\'transaction_read_only\') AS read_only');
   assert.equal(schema.rows[0]?.name,'public');
   assert.equal(schema.rows[0]?.read_only,'on');
   const migration=await c.query(`SELECT version FROM ustara_schema_migrations WHERE version IN
    ('20261208_smart_booking_offers','20261209_smart_booking_confirmation') ORDER BY version`);
   assert.deepEqual(migration.rows.map(x=>x.version),[
    '20261208_smart_booking_offers','20261209_smart_booking_confirmation']);
   const rules=await c.query(`SELECT c.conrelid::regclass::text AS table_name,c.conname,c.contype,c.convalidated
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid IN ('bookings'::regclass,'smart_booking_confirmations'::regclass)
      AND c.conname IN ('bookings_active_time_excl','bookings_customer_time_excl',
                       'smart_booking_confirmations_pkey','smart_booking_confirmations_booking_id_key')`);
   const byName=new Map(rules.rows.map(r=>[r.conname,r]));
   for(const name of ['bookings_active_time_excl','bookings_customer_time_excl']){
    assert.equal(byName.get(name)?.contype,'x',`Missing live exclusion constraint: ${name}`);
    assert.equal(byName.get(name)?.convalidated,true);
   }
   assert.equal(byName.get('smart_booking_confirmations_pkey')?.contype,'p');
   assert.equal(byName.get('smart_booking_confirmations_booking_id_key')?.contype,'u');
   const privacy=await c.query(`SELECT
    (SELECT a.atthasdef FROM pg_catalog.pg_attribute a
      WHERE a.attrelid='walkin_queue_telegram_subscriptions'::regclass
        AND a.attname='offers_consent_at' AND NOT a.attisdropped) AS auto_optin,
    EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid='bookings'::regclass
      AND t.tgname='ustara_smart_opening_booking_cancel' AND NOT t.tgisinternal
      AND t.tgenabled='O') AS cancel_trigger,
    EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class cl ON cl.oid=i.indexrelid
      WHERE i.indrelid='smart_booking_offers'::regclass AND cl.relname='smart_booking_one_pending_opening'
      AND i.indisunique AND i.indisvalid AND i.indpred IS NOT NULL) AS pending_offer_unique`);
   assert.deepEqual(privacy.rows[0],{auto_optin:false,cancel_trigger:true,pending_offer_unique:true});
  }finally{if(c)c.release();await db.end();}
});
