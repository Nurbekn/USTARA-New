// Calendar ranges use local YYYY-MM-DD strings; never use the device timezone
// to shift a barber's Uzbekistan calendar date.
export function calendarDates(from,to,{maxDays=90}={}) {
  const valid = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
  if(!valid(from)||!valid(to)||from>to)throw Error('Sanalar noto‘g‘ri.');
  const start=Date.parse(`${from}T00:00:00Z`),end=Date.parse(`${to}T00:00:00Z`);
  const count=(end-start)/86400000+1;
  if(!Number.isSafeInteger(count)||count<1||count>maxDays)throw Error(`Bir martada 1–${maxDays} kunni belgilang.`);
  return Array.from({length:count},(_,index)=>new Date(start+index*86400000).toISOString().slice(0,10));
}
export function validateCalendarHours({start,end,breakEnabled,breakStart,breakEnd}) {
  const time=value=>typeof value==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    && Number(value.slice(3))%5===0;
  if(!time(start)||!time(end)||start>=end)throw Error('Ish vaqti noto‘g‘ri.');
  if(breakEnabled && (!time(breakStart)||!time(breakEnd)||breakStart<start||breakStart>=breakEnd||breakEnd>end))
    throw Error('Tanaffus ish vaqtining ichida bo‘lishi kerak.');
  return {is_closed:false,start_time:start,end_time:end,
    break_start:breakEnabled?breakStart:null,break_end:breakEnabled?breakEnd:null};
}
