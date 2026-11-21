import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DOCUMENT_COPY, documentSection, getDocumentPresentation} from '../src/utils/documentLocale.js';
import {checkPagesSource} from '../scripts/v150-pages-source-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bootstrap = fs.readFileSync(path.join(root,'public/bootstrap-locale.js'),'utf8');
const sourceHtml = fs.readFileSync(path.join(root,'index.html'),'utf8');
function runBootstrap(search) {
  const status={textContent:'Yuklanmoqda…'};
  const detail={textContent:'Iltimos, biroz kuting'};
  const meta={content:'',setAttribute(name,value){assert.equal(name,'content');this.content=value;}};
  const document={documentElement:{lang:'uz'},title:'',querySelector(s){assert.equal(s,'meta[name="description"]');return meta;},getElementById(id){return id==='ustara-boot-status'?status:id==='ustara-boot-detail'?detail:null;}};
  vm.runInNewContext(bootstrap,{document,location:{search},URLSearchParams,Object}, {timeout:1000});
  return {lang:document.documentElement.lang,title:document.title,description:meta.content,status:status.textContent,detail:detail.textContent};
}
for(const [lang,status,detail] of [
  ['uz','Yuklanmoqda…','Iltimos, biroz kuting'],
  ['ru','Загрузка…','Пожалуйста, подождите'],
  ['en','Loading…','Please wait'],
]) {
  test(`v151: ${lang} initial loading screen uses the correct language and localized metadata`,()=>{
    const actual=runBootstrap('?lang='+lang);
    assert.equal(actual.lang,lang);
    assert.equal(actual.title,DOCUMENT_COPY[lang].title);
    assert.equal(actual.description,DOCUMENT_COPY[lang].description);
    assert.equal(actual.status,status);
    assert.equal(actual.detail,detail);
  });
}
for(const query of ['', '?lang=ru&lang=en', '?lang=__proto__', '?lang=%00', '?lang=tur', '?lang=ru%3Cscript%3E']) {
  test(`v151: unknown or duplicated locale falls back safely (${query||'empty'})`,()=>{
    assert.equal(runBootstrap(query).lang,'uz');
    assert.equal(getDocumentPresentation('/login',query).lang,'uz');
  });
}
for(const [pathname,section] of [
  ['/', 'home'], ['/login','login'], ['/signup/sartarosh','signup'],
  ['/forgot-password','recovery'], ['/account-recovery','recovery'], ['/otp','otp'],
  ['/help','help'], ['/explore','explore'], ['/user/explore','explore'],
  ['/barbers/9','barber'], ['/user/barbers/39','barber'],
  ['/user/bookings','bookings'], ['/barber/queue','queue'],
  ['/user/social','social'], ['/barber/profile','profile'], ['/admin','admin'],
]) {
  test(`v151: ${pathname} maps to fixed safe document section ${section}`,()=>{
    assert.equal(documentSection(pathname),section);
    for(const lang of ['uz','ru','en']){
      const expected=DOCUMENT_COPY[lang];
      const meta=getDocumentPresentation(pathname,`?lang=${lang}&secret=do-not-publish`);
      assert.equal(meta.lang,lang);
      assert.equal(meta.title,section==='home'?expected.title:`${expected.sections[section]} — USTARA`);
      assert.equal(meta.description,expected.description);
      assert.doesNotMatch(meta.title+meta.description,/do-not-publish/);
    }
  });
}
test('v151: private IDs, arbitrary queries and OTP codes are never reflected in titles',()=>{
  for(const pathname of ['/barbers/12345','/user/bookings','/otp','/admin']){
    const meta=getDocumentPresentation(pathname,'?lang=en&otp=76543&token=jwt-secret&email=private@example.com');
    assert.doesNotMatch(JSON.stringify(meta),/76543|jwt-secret|private@example\.com|12345/);
  }
});
test('v151: no storage, cookies, innerHTML or eval in bootstrap source',()=>{
  assert.doesNotMatch(bootstrap,/localStorage|sessionStorage|\.cookie|innerHTML|\beval\s*\(/);
  assert.match(bootstrap,/\.textContent\s*=/);
});
test('v151: HTML loads public locale bootstrap from Pages base before React entry',()=>{
  assert.match(sourceHtml,/<script defer src="%BASE_URL%bootstrap-locale\.js"><\/script>/);
  assert.ok(sourceHtml.indexOf('bootstrap-locale.js')<sourceHtml.indexOf('/src/main.jsx'));
  assert.match(sourceHtml,/id="ustara-boot-status"/);
  assert.match(sourceHtml,/id="ustara-boot-detail"/);
  assert.equal(checkPagesSource(root).htmlAssets,4);
});
test('v151: React Router has global metadata sync but does not modify API settings',()=>{
  const main=fs.readFileSync(path.join(root,'src/main.jsx'),'utf8');
  const component=fs.readFileSync(path.join(root,'src/components/DocumentLocale.jsx'),'utf8');
  assert.match(main,/<DocumentLocale \/>/);
  assert.ok(main.indexOf('<DocumentLocale />')>main.indexOf('basename={import.meta.env.BASE_URL}'));
  assert.match(component,/document\.documentElement\.lang = lang/);
  assert.match(component,/document\.title = title/);
  assert.match(component,/getDocumentPresentation\(location\.pathname, location\.search\)/);
  assert.doesNotMatch(component,/fetch\(|localStorage|setCookie|axios|accessToken|innerHTML/);
});
