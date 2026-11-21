'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const service=require('../services/publicProfilePreview.js');
const script=path.resolve(__dirname,'../scripts/v136-preview-preflight.mjs');
const project=path.resolve(__dirname,'../..');
const defaultEnv={PUBLIC_PROFILE_PREVIEW_ORIGIN:'https://preview.ustara.uz',PUBLIC_PROFILE_APP_BASE_URL:'https://nurbekn.github.io/USTARA-New',VITE_PUBLIC_PROFILE_PREVIEW_ORIGIN:'https://preview.ustara.uz'};
async function preflight(env){ const {inspectPreviewDeployment}=await import('../scripts/v136-preview-preflight.mjs');return inspectPreviewDeployment(env,{projectRoot:project});}
test('configured production preview passes all offline checks but is NOT production-ready',async()=>{
 const r=await preflight(defaultEnv);
 assert.equal(r.status,'READY_FOR_LIVE_VERIFICATION');assert.equal(r.checks.length,6);
 assert.ok(r.checks.every(x=>x.ok));assert.equal(r.productionReady,false);
 assert.equal(r.crawlerUnfurl,'NOT_RUN');assert.equal(r.liveHttps,'NOT_RUN');
});
test('without public config the report fails closed and clearly marks live checks NOT_RUN',async()=>{
 const r=await preflight({});assert.equal(r.status,'BLOCKED_CONFIG_OR_ASSET');
 assert.ok(r.checks.some(x=>!x.ok));assert.equal(r.productionReady,false);assert.equal(r.viteBuild,'NOT_RUN');
});
test('frontend and backend must target the same exact HTTPS preview origin',async()=>{
 const r=await preflight({...defaultEnv,VITE_PUBLIC_PROFILE_PREVIEW_ORIGIN:'https://other.ustara.uz'});
 assert.equal(r.status,'BLOCKED_CONFIG_OR_ASSET');
 assert.equal(r.checks.find(x=>x.id==='client_preview_origin_matches').ok,false);
});
test('incorrect frontend base path cannot pass preflight even when each origin is https',async()=>{
 const r=await preflight({...defaultEnv,PUBLIC_PROFILE_APP_BASE_URL:'https://nurbekn.github.io/wrong-app'});
 assert.equal(r.checks.find(x=>x.id==='app_base_matches_vite').ok,false);
});
test('HTTP remote origins and credentials never pass preflight',async()=>{
 for(const origin of ['http://preview.ustara.uz','https://bad:pass@preview.ustara.uz','https://preview.ustara.uz/?token=secret']) {
  const r=await preflight({...defaultEnv,PUBLIC_PROFILE_PREVIEW_ORIGIN:origin});
  assert.equal(r.checks.find(x=>x.id==='preview_https_origin').ok,false,origin);
 }
});
test('checked asset has expected JPEG dimensions (without decoder/dependency)',async()=>{
 const {jpegDimensions}=await import('../scripts/v136-preview-preflight.mjs');
 const image=fs.readFileSync(path.join(project,'backend/public/share-assets/profile-preview.jpg'));
 assert.deepEqual(jpegDimensions(image),{width:1200,height:630});
 assert.equal(jpegDimensions(Buffer.from('hello')) ,null);
 assert.equal(jpegDimensions(image.subarray(0,8)),null);
});
test('CLI reports blocked configuration using nonzero code and no secret values',()=>{
 const child=spawnSync(process.execPath,[script],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME,JWT_SECRET:'VERY_SECRET'}});
 assert.equal(child.status,2);
 const r=JSON.parse(child.stdout);
 assert.equal(r.status,'BLOCKED_CONFIG_OR_ASSET');
 assert.doesNotMatch(child.stdout,/VERY_SECRET/);
});
test('CLI permits offline checks with correct config but never claims deployed or live passed',()=>{
 const child=spawnSync(process.execPath,[script],{encoding:'utf8',env:{...process.env,...defaultEnv,JWT_SECRET:'VERY_SECRET'}});
 assert.equal(child.status,0);
 const r=JSON.parse(child.stdout);
 assert.equal(r.status,'READY_FOR_LIVE_VERIFICATION');
 assert.equal(r.productionReady,false);assert.equal(r.crawlerUnfurl,'NOT_RUN');
 assert.doesNotMatch(child.stdout,/VERY_SECRET/);
});
test('HTML OG metadata provides HTTPS alt text and image type, never private phone or booking',()=>{
 const barber={id:42,first_name:'Alisher',last_name:'Aliyev',specialty:'Fade',phone:'PRIVATE_PHONE',booking:'PRIVATE_BOOKING'};
 const model=service.previewModel(barber,42,{previewOrigin:defaultEnv.PUBLIC_PROFILE_PREVIEW_ORIGIN,appUrlBase:defaultEnv.PUBLIC_PROFILE_APP_BASE_URL});
 const html=service.renderPreviewHtml(model);
 for(const tag of ['og:image:secure_url','og:image:type','og:image:alt','twitter:image:alt']) assert.ok(html.includes(tag),tag);
 assert.match(html,/image\/jpeg/);
 assert.match(html,/USTARA-New\/barbers\/42/);
 assert.doesNotMatch(html,/PRIVATE_PHONE|PRIVATE_BOOKING/);
});
test('safe HTML metadata always encodes user-supplied quotes and brackets',()=>{
 const m=service.previewModel({id:42,first_name:'"<script>bad</script>',last_name:'',specialty:'x & y'},42,{previewOrigin:defaultEnv.PUBLIC_PROFILE_PREVIEW_ORIGIN,appUrlBase:defaultEnv.PUBLIC_PROFILE_APP_BASE_URL});
 const html=service.renderPreviewHtml(m);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/x &amp; y/);
});
