'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {prunePrivateNotes,validateOptions}=require('../services/privateNoteRetentionV184');
const {parseArgs}=require('../scripts/v182-prune-private-notes.cjs');
function fakeDatabase(config={}) {
 const queries=[], releases=[];
 const client={
  async query(sql,params=[]) {
   queries.push({sql,params});
   if(config.failAt && sql.includes(config.failAt))throw Object.assign(new Error('sensitive DB error'),{code:'XX000'});
   if(sql.includes('current_database()'))return {rowCount:1,rows:[{
    db_name:config.db||'ustara_test_db',schema_name:config.schema||'public',replica:config.replica??false,
    read_only:config.readOnly??(queries[0]?.sql==='BEGIN READ ONLY'?'on':'off'),
   }]};
   if(sql.includes('FROM pg_roles'))return {rowCount:1,rows:[{superuser:config.superuser??false}]};
   if(sql.includes('to_regclass'))return {rowCount:1,rows:[{relation:config.tableMissing?null:'booking_private_notes'}]};
   if(sql.includes('FROM ustara_schema_migrations'))return {rowCount:config.migrationMissing?0:1,rows:config.migrationMissing?[]:[{'?column?':1}]};
   if(sql.includes('pg_try_advisory_xact_lock'))return {rowCount:1,rows:[{acquired:config.lockHeld?false:true}]};
   if(sql.includes('count(*)::text'))return {rowCount:1,rows:[{due:config.dueCount??'50'}]};
   if(sql.includes('DELETE FROM booking_private_notes'))return {rowCount:config.deleteCount??3,rows:[]};
   return {rowCount:0,rows:[]};
  },
  release(broken){releases.push(broken===true);},
 };
 return {client,queries,releases,connect:async()=>client};
}
const preview={expectedDatabase:'ustara_test_db',expectedSchema:'public',execute:false,limit:100};
const execute={...preview,execute:true,acknowledged:true};

test('v184 preview uses PostgreSQL READ ONLY, counts only, never deletes',async()=>{
 const db=fakeDatabase({dueCount:'424'});
 const result=await prunePrivateNotes(db.connect,preview);
 assert.deepEqual(result,{mode:'DRY_RUN',dueCount:'424',deletedCount:0,batchLimit:100});
 assert.equal(db.queries[0].sql,'BEGIN READ ONLY');
 assert.ok(db.queries.some(q=>q.sql==='ROLLBACK'));
 assert.ok(!db.queries.some(q=>q.sql.includes('DELETE FROM booking_private_notes')));
 assert.ok(!db.queries.some(q=>q.sql.includes('COMMIT')));
 assert.deepEqual(db.releases,[false]);
});

test('v184 execute needs explicit confirmation before connecting',async()=>{
 let connected=false;
 await assert.rejects(()=>prunePrivateNotes(async()=>{connected=true;}, {...preview,execute:true}),{code:'confirmation_required'});
 assert.equal(connected,false);
});

test('v184 refuses dangerous target names, bad batch sizes and malformed CLI options',()=>{
 for(const opts of [
  {...preview,expectedDatabase:'postgres'},
  {...preview,expectedSchema:'pg_temp'},
  {...preview,expectedSchema:'a; DROP TABLE users'},
  {...preview,expectedDatabase:'ustara\nprod'},
  {...preview,limit:0}, {...preview,limit:501},{...preview,limit:1.5},
  {...preview,execute:undefined},
 ]) assert.throws(()=>validateOptions(opts));
 for(const args of [
  ['--execute','--database=ustara_test_db','--schema=public'],
  ['--execute','--dry-run','--acknowledge-private-note-retention','--database=ustara_test_db','--schema=public'],
  ['--acknowledge-private-note-retention','--database=ustara_test_db','--schema=public'],
  ['--database=ustara_test_db','--schema=public','--limit=1000'],
  ['--database=ustara_test_db','--schema=public','--whatever'],
  ['--database=ustara_test_db','--database=other','--schema=public'],
 ]) assert.throws(()=>parseArgs(args));
 assert.deepEqual(parseArgs(['--database=ustara_test_db','--schema=public','--limit=100']),
  {...preview,acknowledged:false});
});

test('v184 mismatched database/schema refuses before mutation',async()=>{
 for(const db of [fakeDatabase({db:'wrong_db'}),fakeDatabase({schema:'other'})]){
  await assert.rejects(()=>prunePrivateNotes(db.connect,execute),{code:'wrong_target'});
  assert.ok(db.queries.some(q=>q.sql==='ROLLBACK'));
  assert.ok(!db.queries.some(q=>q.sql.includes('DELETE FROM booking_private_notes')));
 }
});

test('v184 refuses superuser and incomplete schema before mutation',async()=>{
 for(const db of [fakeDatabase({superuser:true}),fakeDatabase({migrationMissing:true}),fakeDatabase({tableMissing:true})]){
  await assert.rejects(()=>prunePrivateNotes(db.connect,execute));
  assert.ok(!db.queries.some(q=>q.sql.includes('DELETE FROM booking_private_notes')));
  assert.deepEqual(db.releases,[false]);
 }
});

test('v184 execute removes only bounded expired rows with transaction and advisory lock',async()=>{
 const db=fakeDatabase({deleteCount:5});
 const result=await prunePrivateNotes(db.connect,{...execute,limit:5});
 assert.deepEqual(result,{mode:'PURGED',deletedCount:5,batchLimit:5,batchLimitReached:true});
 const lock=db.queries.find(q=>q.sql.includes('pg_try_advisory_xact_lock'));
 assert.deepEqual(lock.params,['ustara_test_db','ustara-private-note-retention:public']);
 const deletion=db.queries.find(q=>q.sql.includes('DELETE FROM booking_private_notes'));
 assert.deepEqual(deletion.params,[5]);
 assert.match(deletion.sql,/expires_at <= clock_timestamp\(\)/);
 assert.match(deletion.sql,/FOR UPDATE SKIP LOCKED/);
 assert.match(deletion.sql,/LIMIT \$1/);
 assert.ok(!/RETURNING\s+(note|\*)/i.test(deletion.sql));
 assert.ok(db.queries.some(q=>q.sql==='COMMIT'));
 assert.deepEqual(db.releases,[false]);
});

test('v184 concurrent worker lock is fail-closed, rollback rather than delete',async()=>{
 const db=fakeDatabase({lockHeld:true});
 await assert.rejects(()=>prunePrivateNotes(db.connect,execute),{code:'already_running'});
 assert.equal(db.queries.some(q=>q.sql.includes('DELETE FROM booking_private_notes')),false);
 assert.ok(db.queries.some(q=>q.sql==='ROLLBACK'));
});

test('v184 DB errors return failure, rollback and never leak text',async()=>{
 const db=fakeDatabase({failAt:'DELETE FROM booking_private_notes'});
 await assert.rejects(()=>prunePrivateNotes(db.connect,execute),{code:'XX000'});
 assert.ok(db.queries.some(q=>q.sql==='ROLLBACK'));
 assert.deepEqual(db.releases,[false]);
});

test('v184 unknown COMMIT outcome marks connection unsafe and cannot claim success',async()=>{
 const db=fakeDatabase({failAt:'COMMIT'});
 await assert.rejects(()=>prunePrivateNotes(db.connect,execute),{code:'XX000'});
 assert.deepEqual(db.releases,[true]);
 assert.ok(!db.queries.some(q=>q.sql==='ROLLBACK'));
});

test('v184 privacy boundary, docs and no autopurge in web request lifecycle',()=>{
 const root=path.resolve(__dirname,'..');
 const cli=fs.readFileSync(path.join(root,'scripts/v182-prune-private-notes.cjs'),'utf8');
 const service=fs.readFileSync(path.join(root,'services/privateNoteRetentionV184.js'),'utf8');
 const notes=fs.readFileSync(path.join(root,'controllers/bookingPrivateNotesV182.js'),'utf8');
 assert.match(service,/BEGIN READ ONLY/);
 assert.match(service,/pg_try_advisory_xact_lock/);
 assert.match(cli,/acknowledge-private-note-retention/);
 assert.doesNotMatch(notes,/prunePrivateNotes|prune-private-notes/);
 assert.doesNotMatch(service,/RETURNING\s+note/i);
});
