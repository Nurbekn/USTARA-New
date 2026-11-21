import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {PRIVATE_NOTE_LIMIT_V182,normalizePrivateNote,validPrivateNote,privateBookingNoteTextV182} from '../src/pages/barber/data/bookingPrivateNoteRulesV182.js';
const dir=path.dirname(fileURLToPath(import.meta.url));
const read=file=>fs.readFileSync(path.resolve(dir,'../src',file),'utf8');
test('v182: 500 Unicode characters allowed, blanks and controls denied',()=>{
 assert.equal(PRIVATE_NOTE_LIMIT_V182,500);
 assert.equal(validPrivateNote('🙂'.repeat(500)),true);
 assert.equal(validPrivateNote('🙂'.repeat(501)),false);
 for(const x of ['', '   ',' a ', 'a\u0000','a'.repeat(501)])assert.equal(validPrivateNote(x),false);
 assert.equal(normalizePrivateNote('  hello '),'hello');
});
test('v182: three language labels and private-only instructions',()=>{
 for(const lang of ['uz','ru','en']) {
  const ui=privateBookingNoteTextV182[lang];
  for(const key of ['open','hint','save','remove','reload','unknown'])assert.ok(ui[key]);
 }
});
test('v182: note fetch stays on demand, never cached or indexed, and account changes wipe local state',()=>{
 const component=read('pages/barber/components/BookingPrivateNoteV182.jsx');
 const client=read('pages/barber/data/bookingPrivateNoteV182.js');
 const store=read('pages/barber/data/store.js');
 assert.match(component,/subscribeSession\(reset\)/);
 assert.match(component,/setSaved\(null\)/);
 assert.match(component,/requestRef\.current\?\.abort\(\)/);
 assert.match(component,/onClick=\{\(\)=>\{setOpen\(true\);void load\(\);\}\}/);
 assert.match(client,/getSession\(\)/);assert.match(client,/private-note/);
 assert.doesNotMatch(store,/private-note|privateNote/);
});
test('v182: note not indexed in inbox search or other general booking UI',()=>{
 const inbox=read('pages/barber/data/bookingInboxV176.js');
 const card=read('pages/barber/components/BookingCard.jsx');
 assert.doesNotMatch(inbox,/booking\.note|booking\.private/);
 assert.match(card,/BookingPrivateNoteV182/);
});
