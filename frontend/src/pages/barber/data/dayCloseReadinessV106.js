// Strict, privacy-preserving client interpretation of the server checklist.
// A checklist is never a persisted day-closure, and never mutates queue data.
const keys=['waiting','called','arrived','in_service','pending_qr','active_bookings','active_offers','past_unresolved'];
const validTime = value => typeof value==='string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value));
const tashkentDay = time => new Intl.DateTimeFormat('en-CA',
  {timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
const validDate=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value+'T12:00:00Z'))
  && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export function parseDayCloseReadiness(payload){
  if(!payload || !validDate(payload.queue_date)
    || !validTime(payload.as_of) || tashkentDay(payload.as_of)!==payload.queue_date
    || typeof payload.closed!=='boolean' || payload.read_only!==true
    || !Number.isSafeInteger(payload.revision) || payload.revision<0
    || !payload.counts || typeof payload.counts!=='object'
    || keys.some(k=>!Number.isSafeInteger(payload.counts[k]) || payload.counts[k]<0)
    || !Array.isArray(payload.blockers) || payload.blockers.some(k=>!keys.includes(k))
    || new Set(payload.blockers).size!==payload.blockers.length) return null;
  const expected=keys.filter(k=>payload.counts[k]>0);
  if(expected.length!==payload.blockers.length || expected.some((k,i)=>payload.blockers[i]!==k)
    || payload.ready!==(expected.length===0)) return null;
  return {queue_date:payload.queue_date,as_of:payload.as_of,
    counts:Object.fromEntries(keys.map(k=>[k,payload.counts[k]])),
    blockers:expected,ready:payload.ready,closed:payload.closed,revision:payload.revision};
}
export const DAY_CLOSE_LABELS=Object.freeze({
  waiting:'Kutayotgan mijozlar',called:'Chaqirilganlar',arrived:'Kelganlar',
  in_service:'Xizmat olayotganlar',pending_qr:'Ko‘rib chiqilmagan QR so‘rovlar',
  active_bookings:'Bugungi yakunlanmagan bronlar',active_offers:'Ochiq bo‘sh vaqt takliflari',past_unresolved:'Oldingi kundan qolgan ochiq navbatlar',
});
