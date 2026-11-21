'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parseCsv,audit,EXPECTED_SHA}=require('../../scripts/v67-decision-audit.cjs');
const {auditMigrations}=require('../../scripts/v67-migration-audit.cjs');
const source=fs.readFileSync(path.join(__dirname,'../../docs/USTARA_185_NAZORAT.csv'));
test('immutable 185 decisions and original checksum',()=>{
 const r=audit(source);assert.equal(r.total,185);assert.equal(r.checksum,EXPECTED_SHA);
});
test('status counts remain explicit and no completion is invented',()=>{
 const r=audit(source);assert.deepEqual(r.status,{needs_verification:130,partial:47,deferred_or_cancelled:7,open:1});assert.equal(r.fully_verified,0);
});
test('all decision IDs are mapped to one of ten phases',()=>{
 const r=audit(source);assert.equal(Object.values(r.by_phase).reduce((a,b)=>a+b,0),185);
});
test('CSV parser handles quoted comma, escaped quotes and embedded newline',()=>{
 assert.deepEqual(parseCsv('a,b\n"hello, world","line1\nline2"\n"a""b",c\n'),[['a','b'],['hello, world','line1\nline2'],['a"b','c']]);
});
test('CSV parser rejects malformed quoted rows',()=>{
 assert.throws(()=>parseCsv('a,"unterminated'),/unclosed/);
 assert.throws(()=>parseCsv('a,"x"y'),/unexpected/);
});
test('changed 185 decision source is rejected',()=>{
 assert.throws(()=>audit(Buffer.from(source.toString().replace('Bosh sahifa','Bosh sahifa!'))),/checksum/);
});
test('SQL migration bootstrap has exactly 63 forwards and 2 rollback helpers',()=>{
 const r=auditMigrations();assert.equal(r.forward,63);assert.equal(r.rollback,2);assert.equal(r.runtime,'NOT_RUN');
});
