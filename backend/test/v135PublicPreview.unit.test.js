"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
 safeId, validOrigin, appBase, escapeHtml, text, previewModel, renderPreviewHtml, createPublicPreviewHandler,
} = require("../services/publicProfilePreview");
const { createBarberProfileService } = require("../services/barberProfile");
const origins = { previewOrigin: "https://preview.ustara.uz", appUrlBase: "https://nurbekn.github.io/USTARA-New" };
const good = { id: 42, first_name: "Aziz", last_name: "Karimov", salon_name: "Ustara", specialty: "Fade", phone: "+998 90 PRIVATE", token: "super_secret", address: "private street", avatar_url: "https://unknown.example/evil.jpg" };
function fakeResponse() {
 return { statusCode: 200, headers: {}, status(n) { this.statusCode=n; return this; }, set(k,v) { this.headers[k.toLowerCase()] = v; return this; }, type(type) { this.headers['content-type']=type; return this; }, send(value) { this.body=value; return this; } };
}
async function invoke(lookup = async () => good, raw = "42", config = origins, path = `/share/barbers/${raw}`) {
 const handler = createPublicPreviewHandler({ findPublic: lookup, ...config });
 const res = fakeResponse();
 await handler({ params: { id: raw }, originalUrl: path },res);
 return res;
}
test('strict IDs reject zero, negative, decimals, whitespace, leading zero, encoded data, and bigint',()=>{
 for(const id of ['0','-4','4.2',' 4','04','1%2f2','2147483648','99999999999999999','NaN',undefined,1]) assert.equal(safeId(id),null);
 assert.equal(safeId('42'),42);assert.equal(safeId('2147483647'),2147483647);
});
test('origin validation rejects insecure external http, user-info, query, hash, path, malformed strings',()=>{
 for(const raw of ['http://ustara.uz','https://evil.example/foo','https://x?a=1','https://x/#frag','https://a:b@x/','//evil.example','javascript:alert(1)','ftp://x','https://x./p']) assert.equal(validOrigin(raw),null,raw);
 assert.equal(validOrigin('https://preview.ustara.uz'),'https://preview.ustara.uz');
 assert.equal(validOrigin('http://localhost:3000'),null);
 assert.equal(validOrigin('http://localhost:3000',{allowDevelopmentHttp:true}),'http://localhost:3000');
});
test('deployment app base supports Github Pages subdir, not traversal, credentials, query or offsite HTTP',()=>{
 assert.equal(appBase('https://nurbekn.github.io/USTARA-New/'),'https://nurbekn.github.io/USTARA-New');
 for(const raw of ['https://domain.io/foo/../bar','https://domain.io/?x=1','https://a:b@domain.io','http://evil.test','https://domain.io/a%2fb','https://domain.io/a//b']) assert.equal(appBase(raw),null,raw);
});
test('escapeHtml encodes markup and attribute metacharacters',()=>{
 assert.equal(escapeHtml('<x & "hi" \'hi\'>'),'&lt;x &amp; &quot;hi&quot; &#39;hi&#39;&gt;');
});
test('public text removes hidden controls and enforces limit',()=>{
 assert.equal(text('A\u202e\n B \u0000C'), 'A B C');
 assert.equal(text('a'.repeat(300),90).length,90);
});
test('preview uses only whitelisted public data and static image',()=>{
 const model=previewModel(good,42,origins);
 assert.deepEqual(model,{title:'Aziz Karimov — Ustara',description:'Fade — USTARA’da tasdiqlangan sartarosh profili.',url:'https://preview.ustara.uz/share/barbers/42',image:'https://preview.ustara.uz/share-assets/profile-preview.jpg',imageAlt:'USTARA — sartarosh profili',appUrl:'https://nurbekn.github.io/USTARA-New/barbers/42'});
 const html=renderPreviewHtml(model);
 for (const privateValue of [good.phone,good.token,good.address,good.avatar_url]) assert.equal(html.includes(privateValue),false);
 assert.match(html,/og:title/);assert.match(html,/twitter:card/);assert.match(html,/og:image/);
});
test('hostile text remains literal and never injects HTML or script tags',()=>{
 const model=previewModel({...good,first_name:'<script>alert("hi")</script>',salon_name:'"><img src=x onerror=1>',specialty:'test & <evil>'},42,origins);
 const html=renderPreviewHtml(model);
 assert.doesNotMatch(html,/<script>|<img src=x/);
 assert.match(html,/&lt;script&gt;/);assert.match(html,/&quot;&gt;&lt;img/);
 assert.match(html,/test &amp; &lt;evil&gt;/);
});
test('empty public names and invalid optional data use harmless fallback',()=>{
 const model=previewModel({id:42,first_name:'',last_name:null,specialty:null},42,origins);
 assert.equal(model.title,'Sartarosh');assert.equal(model.description,'USTARA’da tasdiqlangan sartarosh profili.');
});
test('model rejects wrong profile record or broken deployment URLs',()=>{
 assert.equal(previewModel({...good,id:43},42,origins),null);
 assert.equal(previewModel(good,42,{...origins,appUrlBase:'http://untrusted.test'}),null);
 assert.equal(previewModel(good,42,{...origins,previewOrigin:'https://domain.test/?secret=1'}),null);
});
test('public preview returns HTML, no-store, canonical OG + app link after successful lookup',async()=>{
 let seen=null;const r=await invoke(async id=>(seen=id,good));
 assert.equal(seen,42);assert.equal(r.statusCode,200);
 assert.equal(r.headers['cache-control'],'no-store');assert.equal(r.headers['content-type'],'html');
 assert.equal(r.headers['x-robots-tag'],'index,follow');
 assert.match(r.body,/<meta property="og:url" content="https:\/\/preview.ustara.uz\/share\/barbers\/42"/);
 assert.match(r.body,/href="https:\/\/nurbekn.github.io\/USTARA-New\/barbers\/42"/);
});
test('unknown/blocked users yield 404 with no OG and no public data',async()=>{
 for(const record of [null,undefined]){
  const r=await invoke(async()=>record);
  assert.equal(r.statusCode,404);assert.doesNotMatch(r.body,/og:title|Karimov/);
  assert.equal(r.headers['x-robots-tag'],'noindex');
 }
});
test('bad profile ID returns 400 before any database access',async()=>{
 let lookups=0;const r=await invoke(async()=>{lookups++;return good;},'42x');
 assert.equal(r.statusCode,400);assert.equal(lookups,0);
});
test('query strings are not accepted on public preview links',async()=>{
 let lookups=0;const r=await invoke(async()=>{lookups++;return good;},'42',origins,'/share/barbers/42?token=abc');
 assert.equal(r.statusCode,400);assert.equal(lookups,0);
});
test('invalid deployment config fail-closes with 503 before database access',async()=>{
 let lookups=0;const r=await invoke(async()=>{lookups++;return good;},'42',{...origins,previewOrigin:'http://internal.test'});
 assert.equal(r.statusCode,503);assert.equal(lookups,0);
});
test('lookup/database failure returns 503 without public profile data',async()=>{
 const r=await invoke(async()=>{throw Error('DB secret 123');});
 assert.equal(r.statusCode,503);assert.doesNotMatch(r.body,/DB secret|Karimov|og:title/);
});
test('only GET public data path is reused: role and approval/deactivation constraints',async()=>{
 let sql='';const profile=createBarberProfileService({query:async query=>{sql=query;return {rows:[good]};}});
 assert.equal((await profile.getPublic(42)).id,42);
 assert.match(sql,/b\.verification_status='approved'/);assert.match(sql,/u\.deactivated_at IS NULL/);assert.match(sql,/u\.role='barber'/);
 // #159: public barber phone is allowed, but share preview still whitelists no phone.
 assert.match(sql,/u\.phone AS phone/);
});
test('generated image is an app-owned 1200 x 630 JPEG with no remote avatar fetch',()=>{
 const image=fs.readFileSync(path.join(__dirname,'../public/share-assets/profile-preview.jpg'));
 assert.deepEqual([...image.subarray(0,3)],[0xff,0xd8,0xff]);
 assert.ok(image.length<200000);
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 assert.match(server,/app\.get\("\/share\/barbers\/:id", require\("\.\/controllers\/publicProfilePreview"\)\)/);
 assert.match(server,/express\.static\(/);
});
