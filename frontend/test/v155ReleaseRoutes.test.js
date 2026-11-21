import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../../',import.meta.url);
const read=rel=>fs.readFileSync(new URL(rel,root),'utf8');
test('v155: compiled Pages smoke serves QR route through SPA fallback without API mutation',()=>{
 const smoke=read('backend/test/pagesBuild.browser.e2e.test.js');
 assert.match(smoke,/const qrRoute=`\/USTARA-New\/queue\/check-in\/\$\{qrToken\}`/);
 assert.match(smoke,/qrFallback\.status,200/);
 assert.match(smoke,/!!document\.querySelector\("main form input\[maxlength=60\]"\)/);
 assert.doesNotMatch(smoke,/\/api\/queue\/qr-requests/);
});
test('v155: compiled Pages smoke checks real English help page',()=>{
 const smoke=read('backend/test/pagesBuild.browser.e2e.test.js');
 assert.match(smoke,/helpFallback\.status,200/);
 assert.match(smoke,/hc-page #hc-language/);
 assert.match(smoke,/document\.documentElement\.lang'\),'en'/);
});
test('v155: React routes support exactly the QR and public help deep links',()=>{
 const routes=read('frontend/src/App.jsx');
 assert.match(routes,/<Route path="\/queue\/check-in\/:token"/);
 assert.match(routes,/<Route path="\/help"/);
});
test('v155: Vite and React Router retain the GitHub Pages base',()=>{
 const config=read('frontend/vite.config.js');
 const entry=read('frontend/src/main.jsx');
 assert.match(config,/base:\s*['"]\/USTARA-New\/['"]/);
 assert.match(entry,/basename=\{import\.meta\.env\.BASE_URL\}/);
});
test('v155: mandatory browser release gate still checks original 3 subtest names',()=>{
 const gate=read('backend/scripts/v55-release-gate.js');
 assert.match(gate,/SPA fallback: direct forgot-password route renders/);
 assert.match(gate,/published Chrome bundle routes missing, duplicated or out of order/);
});
