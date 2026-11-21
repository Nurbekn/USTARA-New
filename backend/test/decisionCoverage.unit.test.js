'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parseCsv,analyzeCsv,report}=require('../scripts/decision-coverage');
const file=path.resolve(__dirname,'../../docs/USTARA_185_NAZORAT.csv');
const source=fs.readFileSync(file,'utf8');

test('v33 185 decisions are present and NOT misleadingly marked fully implemented',()=>{
 const result=analyzeCsv(source);
 assert.equal(result.total,185);
 assert.equal(Object.values(result.totals).reduce((a,b)=>a+b,0),185);
 assert.ok(result.totals.tekshiruv_kerak>0);
 assert.match(result.fully_verified_proof,/not tracked/);
 assert.deepEqual(result.followup_ids,[175]);
 assert.match(report(result),/ro‘yxatda/);
});
test('v33 CSV parser preserves quoted commas, escaped quotes and line breaks',()=>{
 assert.deepEqual(parseCsv('a,b\r\n"one, two","double ""quote"""\n"multiline\ntext",yes'),[
  ['a','b'],['one, two','double "quote"'],['multiline\ntext','yes']]);
 assert.throws(()=>parseCsv('"unclosed'),/Unclosed/);
});
test('v33 tracker fails closed on missing/duplicate decision or blank answer',()=>{
 const lines=source.trimEnd().split(/\r?\n/);
 assert.throws(()=>analyzeCsv(lines.slice(0,-1).join('\n')),/Expected 185/);
 const duplicated=[...lines];duplicated[2]=duplicated[1];
 assert.throws(()=>analyzeCsv(duplicated.join('\n')),/duplicated|unordered/);
 const absent=[...lines];absent[1]=absent[1].replace(/^[0-9]+,[^,]+/,'1,');
 assert.throws(()=>analyzeCsv(absent.join('\n')),/blank mandatory/);
});
