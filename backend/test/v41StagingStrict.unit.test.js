'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const path=require('node:path');
const {parseTapSummary,runVerifiedTest,verifyV39Migration,validateConfig}=require('../scripts/v40-staging');
const env={NODE_ENV:'test',USTARA_V40_STAGING:'I_AUTHORIZE_LOCAL_STAGING',
 USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test:secret@127.0.0.1:5432/ustara_test_db'};
test('v41 staging TAP parser rejects success exit with all skipped tests',()=>{
 for(const output of ['# tests 1\n# pass 0\n# skipped 1',
   '# tests 0\n# pass 0\n# skipped 0', '# tests 2\n# pass 1\n# fail 1',
   '# tests 1\n# pass 0\n# todo 1','TAP version 13\nok 1 - no totals'])
  assert.throws(()=>parseTapSummary(output),/NOT PASS/);
 assert.deepEqual(parseTapSummary('TAP version 13\nok 1 - one\nok 2 - two\nok 3 - three\n1..3\n# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0'),
  {tests:3,pass:3,fail:0,cancelled:0,skipped:0,todo:0});
});
test('v41 verified subprocess rejects skipped, timeout, and nonzero status',()=>{
 const ok={stdout:'TAP version 13\nok 1 - one\n1..1\n# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0',status:0,signal:null};
 const base={file:'fake.test.js',backend:path.resolve(__dirname,'..'),env};
 const args=[];
 assert.equal(runVerifiedTest({...base,spawn:(cmd,argv,opts)=>{args.push({cmd,argv,opts});return ok;}}).pass,1);
 assert.ok(args[0].argv.includes('--test'));assert.equal(args[0].opts.timeout,90000);
 assert.equal(args[0].opts.stdio,undefined);
 for(const response of [{...ok,stdout:'# tests 1\n# pass 0\n# skipped 1'},
  {...ok,status:1},{...ok,signal:'SIGTERM'},{...ok,error:new Error('timeout')}])
  assert.throws(()=>runVerifiedTest({...base,spawn:()=>response}),/v41:|v45:|v61:/);
});
test('v41 preflight is required to be read-only and use public schema',async()=>{
 const fake=(schema,readonly)=>({query:async q=>({rows:[q.includes('current_schema()')?
  {active_schema:schema,read_only:readonly}:{migration_recorded:true,constraint_present:true}]})});
 assert.equal(await verifyV39Migration(fake('public','on')),true);
 await assert.rejects(verifyV39Migration(fake('public','off')),/read-only/);
 await assert.rejects(verifyV39Migration(fake('private','on')),/public schema/);
 assert.equal(validateConfig(env).tests.length,5);
});
