import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { guideAccountKeyV166, guideSectionV166, guideTextV166, GUIDE_ROUTES_V166 } from '../src/components/onboarding/guideModelV166.js';
import { siteLocalePath } from '../src/utils/siteLocale.js';
const read = name => readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
test('v166 #74 - guidance only addresses recognized, authenticated roles and safe account IDs',()=>{
  assert.equal(guideAccountKeyV166('customer',123),'ustara:guide:v166:customer:123');
  assert.equal(guideAccountKeyV166('barber',123),'ustara:guide:v166:barber:123');
  for(const id of [null,0,-1,1.5,Infinity,'123',Number.MAX_SAFE_INTEGER+1]) assert.equal(guideAccountKeyV166('customer',id),null);
  assert.equal(guideAccountKeyV166('admin',1),null);
  assert.equal(guideTextV166('admin','/user','uz'),null);
});
test('v166 #78 - contextual guidance selects bounded, known pages only',()=>{
  assert.equal(guideSectionV166('customer','/user'),'home');
  assert.equal(guideSectionV166('customer','/user/explore'),'explore');
  assert.equal(guideSectionV166('customer','/user/barbers/40'),'explore');
  assert.equal(guideSectionV166('customer','/user/bookings'),'bookings');
  assert.equal(guideSectionV166('barber','/barber/services'),'services');
  assert.equal(guideSectionV166('barber','/barber/schedule'),'schedule');
  for(const route of ['/userx','//user','/user/does-not-exist','/admin','/login','/user/barbers-secret']) assert.equal(guideSectionV166('customer',route),null);
});
test('v166 #76 - locales provide complete guidance with fixed safe destinations',()=>{
  for(const lang of ['uz','ru','en'])for(const role of ['customer','barber']){
    for(const [section,value] of Object.entries(GUIDE_ROUTES_V166[role])){
      const pathname = `/${role==='customer'?'user':'barber'}${section==='home'?'':'/'+section}`;
      const t = guideTextV166(role,pathname,lang);
      assert.ok(t.title.length>6 && t.description.length>15,`${lang}-${role}-${section}`);
      assert.equal(t.topicPath,`/help?topic=${value.topic}`);
      assert.equal(t.path,value.path);
      assert.ok(siteLocalePath(t.path,lang).startsWith('/'));
      assert.ok(siteLocalePath(t.topicPath,lang).startsWith('/help?'));
      assert.ok(t.open && t.hide && t.dismiss && t.help);
    }
  }
  assert.equal(guideTextV166('customer','/user','xx').title,guideTextV166('customer','/user','uz').title);
});
test('v166 - one optional guidance widget in each protected layout, not auth or booking routes',()=>{
  const user=read('layouts/UserLayout.jsx'),barber=read('layouts/BarberLayout.jsx'),cmp=read('components/onboarding/ContextGuideV166.jsx');
  assert.match(user,/<ContextGuideV166 role="customer"/);
  assert.match(barber,/<ContextGuideV166 role="barber"/);
  assert.match(cmp,/aria-expanded=\{expanded\}/);
  assert.match(cmp,/sessionStorage\.setItem\(key, 'hidden'\)/);
  assert.match(cmp,/getSession|accountId/);
  assert.doesNotMatch(cmp,/fetch\(|\brequest\(|localStorage|\.post\(|\.patch\(|\.delete\(/);
  assert.doesNotMatch(read('App.jsx'),/<ContextGuideV166/);
});
test('v166 #79 - media is lazy/async and offscreen videos do not prefetch',()=>{
  const gallery=read('pages/user/social/MediaGallery.jsx');
  assert.match(gallery,/preload=\{i === index \? "metadata" : "none"\}/);
  assert.match(gallery,/loading="lazy" decoding="async"/);
  const profile=read('pages/user/barber/BarberPublicProfile.jsx');
  assert.match(profile,/preload=\{thumbnail \? "none" : "metadata"\}/);
  assert.match(profile,/decoding="async"/);
  assert.match(read('pages/user/explore/ResultCard.jsx'),/decoding="async"/);
});
