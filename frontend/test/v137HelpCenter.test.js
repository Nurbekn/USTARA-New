import test from 'node:test';
import assert from 'node:assert/strict';
import { HELP_CATEGORIES, HELP_TOPICS, normalizeHelpSearch, readHelpFilters, findHelpTopics, helpTopicUrl } from '../src/pages/help/helpModel.js';

test('v137 — 8 distinct, complete, documented help topics', () => {
  assert.equal(HELP_TOPICS.length, 8);
  assert.equal(new Set(HELP_TOPICS.map(topic => topic.id)).size, HELP_TOPICS.length);
  for(const topic of HELP_TOPICS) {
    assert.ok(topic.title.length > 12);
    assert.ok(topic.answer.length > 50);
    assert.ok(HELP_CATEGORIES.some(c => c.id === topic.category));
    assert.ok(topic.links.length);
  }
});
test('v137 — category filter returns only requested audience', () => {
  assert.ok(findHelpTopics({category:'barber'}).every(t => t.category === 'barber'));
  assert.equal(findHelpTopics({category:'privacy'}).length, 1);
  assert.equal(findHelpTopics({category:'all'}).length, 8);
});
test('v137 — case, spacing and Uzbek apostrophes normalized', () => {
  assert.equal(normalizeHelpSearch('  BO‘SH   VAQT  '), "bo'sh vaqt");
  assert.equal(normalizeHelpSearch('BOʻSH  VAQT'),"bo'sh vaqt");
  assert.ok(findHelpTopics({q:' BO‘SH   VAQT '}).some(topic => topic.id === 'booking'));
});
test('v137 — combined search words filter with AND semantics', () => {
  assert.deepEqual(findHelpTopics({q:'profil xato'}).map(t=>t.id), ['profile']);
  assert.deepEqual(findHelpTopics({q:'xyzzy qwerty'}), []);
});
test('v137 — filters do not match other audience', () => {
  assert.deepEqual(findHelpTopics({category:'barber',q:'OTP'}), []);
});
test('v137 — help topic deep link resolves without login', () => {
  assert.equal(readHelpFilters('?topic=booking').topic,'booking');
  assert.equal(helpTopicUrl('booking'),'/help?topic=booking');
});
test('v137 — unknown topic links never reflect arbitrary URL', () => {
  assert.equal(helpTopicUrl('https://evil.example/'),' /help'.trim());
  assert.equal(readHelpFilters('?topic=unsafe').topic,null);
});
test('v137 — duplicate query parameters are rejected', () => {
  const r=readHelpFilters('?category=barber&category=customer&topic=booking&topic=search&q=a&q=b');
  assert.deepEqual(r,{category:'all',topic:null,q:''});
});
test('v137 — huge untrusted search input is dropped', () => {
  const r=readHelpFilters(new URLSearchParams({q:'x'.repeat(1024)}));
  assert.equal(r.q,'');
});
test('v137 — invalid category falls back to all', () => {
  assert.equal(readHelpFilters('?category=admin').category,'all');
});
test('v137 — help is informational only; no token or OTP in URLs', () => {
  for (const t of HELP_TOPICS) for (const l of t.links) {
    assert.match(l.path,/^\/[a-z/-]+$/);
    assert.doesNotMatch(l.path,/token|otp|password|secret|phone|booking_id/i);
  }
});
test('v137 — privacy advice never asks users to share secrets', () => {
  const p = HELP_TOPICS.find(t=>t.id==='privacy');
  assert.ok(p.answer.includes('Hech kimga'));
  assert.ok(p.answer.includes('OTP'));
});
test('v137 — every topic URL belongs to fixed public help route', () => {
  for(const t of HELP_TOPICS) assert.equal(helpTopicUrl(t.id),`/help?topic=${t.id}`);
});
test('v137 — category and topic filters intersect explicitly',()=>{
  assert.deepEqual(findHelpTopics({category:'barber',topic:'booking'}),[]);
  assert.deepEqual(findHelpTopics({category:'customer',topic:'booking'}).map(t=>t.id),['booking']);
});
test('v137 — no silent account action or network endpoint in content',()=>{
  const all=HELP_TOPICS.map(t=>t.answer).join(' ');
  assert.doesNotMatch(all,/https?:\/\//);
  assert.ok(!HELP_TOPICS.some(t=>t.links.some(l=>/^https?:/.test(l.path))));
});
