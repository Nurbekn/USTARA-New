import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {executeFirstPaint,verifyFirstPaint} from '../scripts/v152-first-paint-smoke.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v152-firstpaint-'));
 for(const item of ['index.html','vite.config.js','src/main.jsx','public/loading.css','public/brand/ustara.svg','public/bootstrap-locale.js']){
  const p=path.join(root,item);fs.mkdirSync(path.dirname(p),{recursive:true});
  fs.copyFileSync(path.join(ROOT,item),p);
 }
 try{return fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('v152: real initial page code passes six language and hostile URL smoke cases',()=>{
 assert.deepEqual(verifyFirstPaint(ROOT),{checks:6,result:'PASS',kind:'BROWSERLESS_VM_NOT_CHROME'});
});
test('v152: first paint never reflects user-provided query into the title',()=>{
 const result=executeFirstPaint(ROOT,'?lang=<img src=x onerror=alert(1)>');
 assert.equal(result.lang,'uz');assert.doesNotMatch(result.title,/img|alert|onerror/i);
});
test('v152: first paint verifies real RU and EN strings, not hardcoded UZ',()=>{
 assert.equal(executeFirstPaint(ROOT,'?lang=ru').detail,'Пожалуйста, подождите');
 assert.equal(executeFirstPaint(ROOT,'?lang=en').status,'Loading…');
});
test('v152: broken real locale script must fail the gate',()=>fixture(root=>{
 const file=path.join(root,'public/bootstrap-locale.js');
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('Загрузка…','BROKEN'));
 assert.throws(()=>verifyFirstPaint(root),/NOT PASS/);
}));
test('v152: swapped locale script after module entry must fail',()=>fixture(root=>{
 const p=path.join(root,'index.html');let html=fs.readFileSync(p,'utf8');
 html=html.replace('    <script defer src="%BASE_URL%bootstrap-locale.js"></script>','');
 html=html.replace('<script type="module" src="/src/main.jsx"></script>','<script type="module" src="/src/main.jsx"></script>\n<script defer src="%BASE_URL%bootstrap-locale.js"></script>');
 fs.writeFileSync(p,html);assert.throws(()=>verifyFirstPaint(root),/NOT PASS/);
}));
test('v152: a missing locale bootstrap asset must fail',()=>fixture(root=>{
 fs.rmSync(path.join(root,'public/bootstrap-locale.js'));
 assert.throws(()=>verifyFirstPaint(root),/NOT PASS/);
}));
test('v152: standalone package-free first-paint gate succeeds',()=>{
 const child=spawnSync(process.execPath,['scripts/v152-first-paint-smoke.mjs','--json'],{cwd:ROOT,encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);
 assert.deepEqual(JSON.parse(child.stdout),{checks:6,result:'PASS',kind:'BROWSERLESS_VM_NOT_CHROME'});
});
