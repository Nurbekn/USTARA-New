import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const ROOT=path.resolve(import.meta.dirname,'../src');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
test('#109 owner can edit at most five self-reported certificates',()=>{
 const ui=read('pages/barber/Profile.jsx');
 assert.match(ui,/form\.certificates\.length < 5/);
 assert.match(ui,/certificates: form\.certificates\.map/);
 for(const k of ['title','issuer','year'])assert.match(ui,new RegExp(`certificate\\.${k}`));
 assert.match(ui,/not platform-verified badges/);
 assert.match(read('pages/barber/data/store.js'),/certificates: "certificates"/);
});
test('#109 public profile says certificates are unverified, never vendor-verified',()=>{
 const publicUI=read('pages/user/barber/BarberPublicProfile.jsx');
 assert.match(publicUI,/not verified by USTARA/);
 assert.match(publicUI,/barber\.certificates\.map/);
 const model=read('pages/user/barber/publicProfile.js');
 assert.match(model,/barber\.certificates\.length <= 5/);
 assert.match(model,/Number\.isInteger\(c\.year\)/);
});
