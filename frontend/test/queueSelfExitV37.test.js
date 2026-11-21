import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const qr=fs.readFileSync(new URL('../src/pages/queue/QueueCheckIn.jsx',import.meta.url),'utf8');
const manual=fs.readFileSync(new URL('../src/pages/queue/ManualQueue.jsx',import.meta.url),'utf8');
test('v37 QR leave asks for explicit second confirmation and sends private receipt',()=>{
 assert.match(qr,/setLeaveConfirm\(true\)/);
 assert.match(qr,/onClick=\{\(\)=>void leaveQueue\(\)\}/);
 assert.match(qr,/request\('POST','\/api\/queue\/qr-leave',\{body:\{token,request_id:keyRef\.current\}\}\)/);
 assert.match(qr,/Tasdiqlangan bronlar saqlanadi/);
});
test('v37 manual leave is separate from unlinking an account and requires auth',()=>{
 assert.match(manual,/setLeaveConfirmId\(entry\.id\)/);
 assert.match(manual,/`\/api\/queue\/manual\/\$\{id\}\/leave`/);
 assert.match(manual,/async token=>request\('POST',`\/api\/queue\/manual\/\$\{id\}\/leave`,\{token\}\)/);
 assert.match(manual,/executeAccountAction\(\{token,currentToken:getToken,action/);
 assert.match(manual,/Akkauntimdan navbatni uzish \(navbatda qolaman\)/);
});
