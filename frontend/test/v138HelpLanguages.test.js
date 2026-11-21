import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HELP_LANGUAGES, HELP_TRANSLATIONS } from '../src/pages/help/helpTranslations.js';
import {
  HELP_TOPICS, HELP_CATEGORIES, getHelpCategories, getHelpUi, getHelpTopics,
  findHelpTopics, localizedHelpHomeUrl, localizedHelpTopicUrl,
  readHelpFilters, readHelpLocale, helpTopicUrl,
} from '../src/pages/help/helpModel.js';

const read = name => readFileSync(new URL(`../src/pages/help/${name}`,import.meta.url),'utf8');
const allIds = HELP_TOPICS.map(topic=>topic.id);

// The original Uzbek interface and historical help deep links remain stable.
test('v138 1 — supported locales are exactly uz, ru, en',()=> {
  assert.deepEqual(HELP_LANGUAGES.map(l=>l.id), ['uz','ru','en']);
});
test('v138 2 — original Uzbek help topics remain unchanged',()=> {
  assert.strictEqual(getHelpTopics('uz'), HELP_TOPICS);
  assert.equal(getHelpUi('uz').title, 'Qanday yordam kerak?');
});
test('v138 3 — old topic links and query parser preserve v137 behavior',()=> {
  assert.equal(helpTopicUrl('booking'), '/help?topic=booking');
  assert.deepEqual(readHelpFilters('?topic=booking'),{category:'all',topic:'booking',q:''});
});
test('v138 4 — locale parser defaults to Uzbek',()=> {
  for (const input of ['', '?q=foo', '?lang=', '?lang=de', '?lang=RU', '?lang=ru&lang=en', '?lang=%2F%2Fevil.example'])
    assert.equal(readHelpLocale(input),'uz');
});
test('v138 5 — valid locale URL variants are recognized',()=> {
  assert.equal(readHelpLocale('?lang=ru'),'ru');
  assert.equal(readHelpLocale(new URLSearchParams('lang=en')),'en');
});
test('v138 6 — source FAQ count, order, and IDs are stable in all languages',()=> {
  for (const lang of ['uz','ru','en']) {
    const t=getHelpTopics(lang);
    assert.deepEqual(t.map(x=>x.id),allIds);
    assert.equal(t.length,8);
    assert.deepEqual(t.map(x=>x.category),HELP_TOPICS.map(x=>x.category));
  }
});
test('v138 7 — every locale has all categories and UI strings',()=> {
  const keys=Object.keys(HELP_TRANSLATIONS.uz.ui).sort();
  for(const lang of ['uz','ru','en']) {
    assert.deepEqual(Object.keys(getHelpUi(lang)).sort(),keys);
    const cats=getHelpCategories(lang);
    assert.deepEqual(cats.map(c=>c.id),HELP_CATEGORIES.map(c=>c.id));
    for (const c of cats) assert.ok(c.label.length > 1);
    assert.equal(getHelpUi(lang).introSteps.length,3);
  }
});
test('v138 8 — translations have complete non-empty titles, answers and links',()=> {
  for(const lang of ['ru','en']) {
    assert.deepEqual(Object.keys(HELP_TRANSLATIONS[lang].topics).sort(), allIds.toSorted());
    getHelpTopics(lang).forEach((topic, i)=>{
      assert.ok(topic.title.length >= 12,topic.id);
      assert.ok(topic.answer.length >= 50,topic.id);
      assert.ok(topic.keywords.length >= 7,topic.id);
      assert.equal(topic.links.length, HELP_TOPICS[i].links.length);
      assert.ok(topic.links.every(x=>x.label.length > 3));
    });
  }
});
test('v138 9 — link destinations and sign-in flags cannot vary with translated text',()=> {
  for (const lang of ['ru','en']) {
    const topics=getHelpTopics(lang);
    topics.forEach((topic,i)=>{
      assert.deepEqual(topic.links.map(x=>({path:x.path,auth:x.auth})),HELP_TOPICS[i].links.map(x=>({path:x.path,auth:x.auth})));
      assert.ok(topic.links.every(link=>link.path.startsWith('/') && !link.path.startsWith('//')));
    });
  }
});
test('v138 10 — translated search matches Russian text',()=> {
  assert.deepEqual(findHelpTopics({lang:'ru',q:'Как записаться?'}).map(t=>t.id),['booking']);
});
test('v138 11 — translated search matches English text',()=> {
  assert.deepEqual(findHelpTopics({lang:'en',q:'  PERSONAL   DATA '}).map(t=>t.id),['privacy']);
});
test('v138 12 — localized search stays in its selected language',()=> {
  assert.deepEqual(findHelpTopics({lang:'ru',q:'запись'}).map(t=>t.id),['booking','bookings']);
});
test('v138 13 — localized categories still restrict FAQ correctly',()=> {
  assert.equal(findHelpTopics({lang:'ru',category:'privacy'}).length,1);
  assert.deepEqual(findHelpTopics({lang:'en',category:'barber',topic:'booking'}),[]);
});
test('v138 14 — malformed lang falls back to original Uzbek content',()=> {
  assert.deepEqual(getHelpTopics('__proto__'),HELP_TOPICS);
  assert.equal(getHelpUi('zz').title,getHelpUi('uz').title);
  assert.deepEqual(getHelpCategories('zz'),getHelpCategories('uz'));
});
test('v138 15 — localized deep links carry only language and topic',()=> {
  assert.equal(localizedHelpTopicUrl('booking','ru'),'/help?topic=booking&lang=ru');
  assert.equal(localizedHelpTopicUrl('booking','en'),'/help?topic=booking&lang=en');
  assert.equal(localizedHelpTopicUrl('booking','uz'),'/help?topic=booking');
});
test('v138 16 — unsafe topic or language never enters a generated link',()=> {
  assert.equal(localizedHelpTopicUrl('javascript:alert(1)','ru'),'/help');
  assert.equal(localizedHelpTopicUrl('booking','https://attacker'),'/help?topic=booking');
  assert.equal(localizedHelpHomeUrl('https://attacker'),'/help');
});
test('v138 17 — back links retain RU/EN and clean default Uzbek',()=> {
  assert.equal(localizedHelpHomeUrl('ru'),'/help?lang=ru');
  assert.equal(localizedHelpHomeUrl('en'),'/help?lang=en');
  assert.equal(localizedHelpHomeUrl('uz'),'/help');
});
test('v138 18 — translated privacy advice warns against sharing OTP and tokens',()=> {
  for (const lang of ['ru','en']) {
    const p=getHelpTopics(lang).find(t=>t.id==='privacy');
    assert.match(p.answer, /OTP/);
    assert.match(p.answer, /токен|token/i);
  }
});
test('v138 19 — locale selection uses accessible native select and language attribute',()=> {
  const ui=read('HelpCenter.jsx');
  assert.match(ui,/htmlFor="hc-language"/);
  assert.match(ui,/<select id="hc-language"/);
  assert.match(ui,/className="hc-page" lang=\{lang\}/);
});
test('v138 20 — switching language clears stale query without losing the topic',()=> {
  const ui=read('HelpCenter.jsx');
  assert.match(ui,/update\(\{ lang: event\.target\.value, q: '' \}\)/);
  assert.match(ui,/if \(merged\.topic\)/);
});
test('v138 21 — help still does not send personal data or trigger actions',()=> {
  const ui=read('HelpCenter.jsx');
  assert.doesNotMatch(ui, /fetch\(|localStorage\.|sessionStorage\.|\.post\(|request\(/);
  assert.match(ui,/aria-expanded=/);
  assert.match(ui,/aria-live="polite"/);
});
test('v138 22 — translated help content includes no externally fetched URLs',()=> {
  const strings=JSON.stringify(HELP_TRANSLATIONS);
  assert.doesNotMatch(strings,/https?:\/\//i);
  assert.doesNotMatch(strings,/api_key|Bearer |Authorization:/i);
});
test('v138 23 — UI retains all eight source URLs with language-independent destinations',()=> {
  const ui=read('HelpCenter.jsx');
  assert.match(ui,/to=\{siteLocalePath\(item\.path, lang\)\}/);
  assert.match(ui,/localizedHelpTopicUrl\(topic\.id, lang\)/);
});
test('v138 24 — language selector is keyboard-focusable in small screens',()=> {
  const css=read('HelpCenter.css');
  assert.match(css,/\.hc-page select:focus-visible/);
  assert.match(css,/\.hc-language select\{[^}]*max-width:100%/);
});
test('v138 25 — translation is deliberately scoped to Help, not admin localization',()=> {
  assert.match(read('helpTranslations.js'),/No admin panel/);
  assert.equal(getHelpTopics('en').length,HELP_TOPICS.length);
});
