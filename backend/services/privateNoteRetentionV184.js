'use strict';
// #179: operator-controlled, bounded retention of expired private booking notes.
// No SQL or log output may contain a note's content or a booking identifier.
const TABLE_MIGRATION = '20261228_private_booking_notes';
const MAX_BATCH = 500;
const validLabel = value => typeof value === 'string' && /^[a-zA-Z_][a-zA-Z_0-9]{0,62}$/.test(value)
  && !/^pg_/i.test(value) && !['information_schema','pg_catalog'].includes(value.toLowerCase());
const validDatabase = value => typeof value === 'string' && value.length >= 1 && value.length <= 127
  && !/[\u0000-\u001f]/.test(value) && !['postgres','template0','template1'].includes(value.toLowerCase());
function validateOptions(options) {
  if (!options || !validDatabase(options.expectedDatabase) || !validLabel(options.expectedSchema))
    throw Object.assign(new Error('Database and schema identity must be explicit and valid'), {code:'invalid_target'});
  const limit = options.limit === undefined ? 100 : options.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH)
    throw Object.assign(new Error('Batch size must be 1..500'), {code:'invalid_limit'});
  if (typeof options.execute !== 'boolean')
    throw Object.assign(new Error('Explicit dry-run or execute mode required'), {code:'invalid_mode'});
  if (options.execute && options.acknowledged !== true)
    throw Object.assign(new Error('Deletion requires explicit operator acknowledgement'), {code:'confirmation_required'});
  return {expectedDatabase:options.expectedDatabase,expectedSchema:options.expectedSchema,limit,
    execute:options.execute};
}
async function prunePrivateNotes(connect, options) {
  const o = validateOptions(options);
  if (typeof connect !== 'function') throw Object.assign(new Error('Connection factory required'),{code:'invalid_connection'});
  let client, transaction=false, commitStarted=false, unhealthy=false;
  try {
    client=await connect();
    // Dry run is *enforced by the database*, not just by JavaScript branching.
    await client.query(o.execute ? 'BEGIN' : 'BEGIN READ ONLY');
    transaction=true;
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const identity=await client.query(`SELECT current_database() AS db_name, current_schema() AS schema_name,
      pg_is_in_recovery() AS replica, current_setting('transaction_read_only') AS read_only`);
    if (identity.rowCount!==1 || identity.rows[0].db_name!==o.expectedDatabase
      || identity.rows[0].schema_name!==o.expectedSchema
      || (o.execute && (identity.rows[0].replica!==false || identity.rows[0].read_only!=='off')))
      throw Object.assign(new Error('Connected database identity does not match approved target'),{code:'wrong_target'});
    const role=await client.query(`SELECT rolsuper AS superuser FROM pg_roles WHERE rolname=current_user`);
    if (role.rowCount!==1 || role.rows[0].superuser!==false)
      throw Object.assign(new Error('Use a restricted database role for maintenance'),{code:'privileged_connection'});
    // Avoid relying on an untrusted search_path or pg_temp shadow tables.
    await client.query(`SET LOCAL search_path TO "${o.expectedSchema}", pg_catalog`);
    const schema=await client.query(`SELECT to_regclass(format('%I.booking_private_notes',$1))::text AS relation`,[o.expectedSchema]);
    if (schema.rowCount!==1 || !schema.rows[0].relation)
      throw Object.assign(new Error('Private notes table unavailable'),{code:'schema_missing'});
    const migration=await client.query('SELECT 1 FROM ustara_schema_migrations WHERE version=$1',[TABLE_MIGRATION]);
    if (migration.rowCount!==1)
      throw Object.assign(new Error('Retention migration is not installed'),{code:'migration_missing'});
    let result;
    if (!o.execute) {
      const preview=await client.query(`SELECT count(*)::text AS due FROM booking_private_notes
        WHERE expires_at <= clock_timestamp()`);
      if (preview.rowCount!==1 || !/^\d+$/.test(preview.rows[0].due))
        throw Object.assign(new Error('Invalid preview result'),{code:'preview_unavailable'});
      result={mode:'DRY_RUN',dueCount:preview.rows[0].due,deletedCount:0,batchLimit:o.limit};
      await client.query('ROLLBACK');
      transaction=false;
    } else {
      const lock=await client.query(`SELECT pg_try_advisory_xact_lock(
        pg_catalog.hashtext($1), pg_catalog.hashtext($2)) AS acquired`,
        [o.expectedDatabase,'ustara-private-note-retention:'+o.expectedSchema]);
      if (lock.rowCount!==1 || lock.rows[0].acquired!==true)
        throw Object.assign(new Error('Another retention worker owns the lease'),{code:'already_running'});
      // Bounded transaction; row locks prevent duplicate claims by concurrent workers.
      // No note data is returned, including to the application process.
      const deleted=await client.query(`WITH due AS (
        SELECT booking_id FROM booking_private_notes
        WHERE expires_at <= clock_timestamp()
        ORDER BY expires_at,booking_id LIMIT $1 FOR UPDATE SKIP LOCKED
      )
      DELETE FROM booking_private_notes n USING due
      WHERE n.booking_id=due.booking_id`,[o.limit]);
      if (!Number.isInteger(deleted.rowCount) || deleted.rowCount<0 || deleted.rowCount>o.limit)
        throw Object.assign(new Error('Invalid delete count'),{code:'result_unavailable'});
      result={mode:'PURGED',deletedCount:deleted.rowCount,batchLimit:o.limit,
        batchLimitReached:deleted.rowCount===o.limit};
      commitStarted=true;
      await client.query('COMMIT');
      transaction=false;
    }
    return result;
  } catch (error) {
    if (commitStarted) unhealthy=true;
    if (transaction && !commitStarted) {
      try {await client?.query('ROLLBACK');} catch {unhealthy=true;}
    }
    throw error;
  } finally {
    try {client?.release(unhealthy);} catch { /* Do not shadow error */ }
  }
}
module.exports={prunePrivateNotes,validateOptions,MAX_BATCH};
