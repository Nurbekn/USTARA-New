'use strict';
// v184: opt-in, target-pinned maintenance CLI. No database calls without valid arguments.
const {prunePrivateNotes,validateOptions}=require('../services/privateNoteRetentionV184');
function parseArgs(argv) {
  const expected=new Set(['--execute','--acknowledge-private-note-retention','--dry-run']);
  const flags=new Set(), values={};
  for (const arg of argv) {
    if (arg.startsWith('--database=')) {
      if (values.expectedDatabase!==undefined) throw Object.assign(Error('duplicate database'),{code:'invalid_options'});
      values.expectedDatabase=arg.slice('--database='.length);
    } else if (arg.startsWith('--schema=')) {
      if (values.expectedSchema!==undefined) throw Object.assign(Error('duplicate schema'),{code:'invalid_options'});
      values.expectedSchema=arg.slice('--schema='.length);
    } else if (arg.startsWith('--limit=')) {
      if (values.limit!==undefined) throw Object.assign(Error('duplicate limit'),{code:'invalid_options'});
      const raw=arg.slice('--limit='.length);
      if (!/^[1-9]\d{0,2}$/.test(raw)) throw Object.assign(Error('invalid limit'),{code:'invalid_options'});
      values.limit=Number(raw);
    } else if (expected.has(arg)) {
      if (flags.has(arg)) throw Object.assign(Error('duplicate flag'),{code:'invalid_options'});
      flags.add(arg);
    } else throw Object.assign(Error('unknown argument'),{code:'invalid_options'});
  }
  if (flags.has('--execute') && flags.has('--dry-run'))
    throw Object.assign(Error('conflicting modes'),{code:'invalid_options'});
  if (flags.has('--acknowledge-private-note-retention') && !flags.has('--execute'))
    throw Object.assign(Error('acknowledgement without execute'),{code:'invalid_options'});
  const options={...values,execute:flags.has('--execute'),
    acknowledged:flags.has('--acknowledge-private-note-retention')};
  validateOptions(options);
  return options;
}
async function main(argv=process.argv.slice(2),env=process.env,loadPool=()=>require('pg').Pool) {
  const options=parseArgs(argv); // Fail before even loading the postgres driver.
  if (!env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(env.DATABASE_URL))
    throw Object.assign(Error('DATABASE_URL required'),{code:'missing_database_url'});
  const Pool=loadPool();
  const pool=new Pool({connectionString:env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,
    idleTimeoutMillis:1000,query_timeout:12000});
  try {
    const result=await prunePrivateNotes(()=>pool.connect(),options);
    process.stdout.write(JSON.stringify(result)+'\n');
    return result;
  } finally {await pool.end();}
}
if (require.main===module) main().catch(error=>{
  // Do not log DB URLs, SQL values, note text or arbitrary driver error messages.
  console.error('Private note retention not completed',{code:error.code||'unavailable'});
  process.exitCode=1;
});
module.exports={main,parseArgs};
