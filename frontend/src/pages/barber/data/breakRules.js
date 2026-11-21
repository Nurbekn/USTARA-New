// Client validation is for fast feedback; the server is authoritative.
const TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
export const weekDays=['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'];
export function validateBreakRanges(ranges){
  if(!Array.isArray(ranges)||ranges.length>8)throw Error('Bir kunda ko‘pi bilan 8 ta tanaffus mumkin.');
  const sorted=ranges.map(r=>{
    if(!r||!TIME.test(r.start||'')||!TIME.test(r.end||'')||r.start>=r.end
      ||Number(r.start.slice(3))%5!==0||Number(r.end.slice(3))%5!==0)
      throw Error('Tanaffus 5 daqiqalik qadamda, boshlanishi tugashidan oldin bo‘lsin.');
    return {start:r.start,end:r.end};
  }).sort((a,b)=>a.start.localeCompare(b.start));
  for(let i=1;i<sorted.length;i++)if(sorted[i-1].end>sorted[i].start)
    throw Error('Tanaffuslar ustma-ust tushmasligi kerak.');
  return sorted;
}
export function intervalsForWeek(items,day){
  return (items||[]).filter(x=>Number(x.day_of_week)===Number(day)).map(x=>({start:x.start,end:x.end}));
}
export function intervalsForDate(items,date){
  return (items||[]).filter(x=>x.date===date).map(x=>({start:x.start,end:x.end}));
}
