import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DRAFT_KEY, DRAFT_TTL_MS, readBookingDraft, saveBookingDraft} from '../src/pages/user/barber/bookingDraft.js';
import {persistBookingSelectionV181, bookingDraftStatusCopyV181} from '../src/pages/user/barber/bookingDraftStatusV181.js';
function storage() {const m=new Map();return {m,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
const choice={barberId:12,serviceIds:[2,3],date:'2030-05-12',time:'13:05',token:'PRIVATE',phone:'+998900000000'};
test('#183: browser-saved badge requires a readable, matching write',()=>{
 const s=storage(); const value=persistBookingSelectionV181(choice,s,100000);
 assert.deepEqual(value,{kind:'saved',expiresAt:100000+DRAFT_TTL_MS});
 assert.deepEqual(readBookingDraft(s,100000).serviceIds,[2,3]);
 assert.doesNotMatch(s.getItem(DRAFT_KEY),/PRIVATE|998900000000|token|phone/);
});
test('#183: silent no-op storage must not show success',()=>{
 const s={getItem(){return null},setItem(){},removeItem(){}};
 assert.equal(saveBookingDraft(choice,s,100000),false);
 assert.equal(persistBookingSelectionV181(choice,s,100000).kind,'failed');
});
test('#183: readback exception, write exception and absent storage fail closed',()=>{
 for(const s of [null,{getItem(){throw Error('blocked')},setItem() {},removeItem() {}},
   {getItem(){return null},setItem(){throw Error('blocked')},removeItem(){}}]) {
  assert.equal(persistBookingSelectionV181(choice,s,100000).kind,'failed');
 }
});
test('#183: expired selection is not declared saved or renewed without an explicit save',()=>{
 const s=storage();persistBookingSelectionV181(choice,s,100000);
 assert.equal(readBookingDraft(s,100000+DRAFT_TTL_MS+1),null);
 assert.equal(persistBookingSelectionV181(choice,s,100000+DRAFT_TTL_MS+2).expiresAt,100000+2*DRAFT_TTL_MS+2);
});
test('#183: no selected services is not a pending or confirmed booking',()=>{
 assert.deepEqual(persistBookingSelectionV181({...choice,serviceIds:[]},storage(),100000),{kind:'none'});
 assert.equal(persistBookingSelectionV181({...choice,time:'12:01'},storage(),100000).kind,'failed');
});
test('#183: Uzbek/Russian/English text explicitly disclaims booking creation',()=>{
 assert.match(bookingDraftStatusCopyV181('uz').saved,/bron emas/i);
 assert.match(bookingDraftStatusCopyV181('ru').saved,/не запись/i);
 assert.match(bookingDraftStatusCopyV181('en').saved,/not a booking/i);
 assert.match(bookingDraftStatusCopyV181('none').failed,/bron yaratilmagan/i);
});
test('#183: InlineBooking renders saved, failed, expired states with retry, not a POST',async()=>{
 const ui=await readFile(new URL('../src/pages/user/barber/InlineBooking.jsx',import.meta.url),'utf8');
 assert.match(ui,/persistBookingSelectionV181/);
 assert.match(ui,/draftSaveState\.kind === 'expired'/);
 assert.match(ui,/draftSaveState\.kind === 'failed'/);
 assert.match(ui,/retryDraftSave/);
 assert.match(ui,/setTimeout\(/);
});
