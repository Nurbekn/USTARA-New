import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('v43 unauthorized queue API response logs out entire revoked session; forbidden remains local only',()=>{
 const src=readFileSync(new URL('../src/pages/queue/ManualQueue.jsx',import.meta.url),'utf8');
 assert.match(src,/getSession,subscribeSession,clearSession/);
 assert.match(src,/if\(e\.status===401\)\{clearPrivate\(\);clearSession\(\);setHasAccount\(false\);\}/);
 assert.match(src,/else if\(e\.status===403\)clearPrivate\(\)/);
 assert.match(src,/getToken\(\)!==token\|\|!readGate\.current\.isLatest\(requestId\)/);
});
