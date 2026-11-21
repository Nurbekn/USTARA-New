import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {qrSiteDestination,SUPPORTED_QR_BASES,SUPPORTED_QR_LANGUAGES} from '../src/pages/barber/data/v154QrSiteDestination.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const base of SUPPORTED_QR_BASES){
 for(const lang of SUPPORTED_QR_LANGUAGES){
  test(`v154 QR request carries correct public origin, ${base} base, ${lang} locale`,()=>{
   const data=qrSiteDestination('https://nurbekn.github.io',base,lang);
   assert.deepEqual(data,{origin:'https://nurbekn.github.io',base_path:base,lang});
   assert.deepEqual(Object.keys(data),['origin','base_path','lang']);
  });
 }
}
test('v154 invalid/malicious/malformed QR base paths fail closed',()=>{
 for(const base of ['','/USTARA-New','//attacker.com/','/other/','/USTARA-New/../','/USTARA-New/%2e%2e/',null,undefined,{},1]){
  assert.throws(()=>qrSiteDestination('https://nurbekn.github.io',base,'uz'));
 }
});
test('v154 unknown, polluted or non-string locale fails closed',()=>{
 for(const lang of ['UZ','Ru','uz?otp=12345','en&password=a','',null,undefined,{},10]){
  assert.throws(()=>qrSiteDestination('https://nurbekn.github.io','/USTARA-New/',lang));
 }
});
test('v154 rejects embedded credentials, URL query and off-origin path in QR request',()=>{
 for(const origin of ['https://nurbekn.github.io/something','https://user:pw@nurbekn.github.io',
  'https://nurbekn.github.io?lang=en','https://nurbekn.github.io#x','javascript:alert(1)',null]){
  assert.throws(()=>qrSiteDestination(origin,'/USTARA-New/','uz'));
 }
});
test('v154 frontend request payload cannot leak tokens or arbitrary search parameters',()=>{
 const data=qrSiteDestination('http://localhost:5173','/USTARA-New/','ru');
 assert.deepEqual(Object.keys(data),['origin','base_path','lang']);
 assert.ok(!JSON.stringify(data).includes('token'));
});
test('v154 Queue JSX uses Vite BASE_URL for public QR destination',()=>{
 const queue=readFileSync(path.join(root,'src/pages/barber/Queue.jsx'),'utf8');
 assert.match(queue,/qrSiteDestination\(window\.location\.origin,import\.meta\.env\.BASE_URL,lang\)/);
 assert.doesNotMatch(queue,/body:\{origin:window\.location\.origin\}/);
});
test('v154 production Vite base path is one explicitly supported by QR route',()=>{
 const vite=readFileSync(path.join(root,'vite.config.js'),'utf8');
 const match=vite.match(/base:\s*['"](\/[^'"\s]+)['"]/);
 assert.ok(match);
 assert.ok(SUPPORTED_QR_BASES.includes(match[1]));
});
import {verifyQrPreflight} from '../scripts/v154-qr-preflight.mjs';
test('v154 offline QR release preflight passes actual frontend and backend contract',()=>{
 const r=verifyQrPreflight();
 assert.equal(r.status,'PASS_SOURCE_CONTRACT_ONLY');
 assert.equal(r.basePath,'/USTARA-New/');
 assert.equal(r.browserScan,'NOT_RUN');
 assert.equal(r.productionReady,false);
});
test('v154 QR release gate rejects wrong Vite deployment base',()=>{
 assert.throws(()=>verifyQrPreflight({viteConfig:'export default { base: "/bad/" }'}),/NOT PASS/);
});
test('v154 QR release gate rejects unmounted root base',()=>{
 assert.throws(()=>verifyQrPreflight({viteConfig:'export default { base: "/" }'}),/NOT PASS/);
});
test('v154 QR release gate rejects missing client base-path use',()=>{
 assert.throws(()=>verifyQrPreflight({queueSource:'body:{origin:window.location.origin}'}),/NOT PASS/);
});
test('v154 QR release gate rejects missing server-side base validation',()=>{
 assert.throws(()=>verifyQrPreflight({controllerSource:'const url=publicQueueLink(origin,raw,{base_path,lang})'}),/NOT PASS/);
});
