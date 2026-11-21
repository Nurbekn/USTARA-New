// Quote preview only. Backend re-reads active services and price under locks.
const centsOf = value => {
 const s=String(value ?? '');
 if(!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(s))return null;
 const [whole,decimal='']=s.split('.');
 const cents=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 return Number.isSafeInteger(cents)&&cents>0?cents:null;
};
export function offerBundle(services,selectedIds,targetDuration){
 const target=Number(targetDuration);
 if(!Array.isArray(services)||!Array.isArray(selectedIds)||
    !Number.isSafeInteger(target)||target<=0||selectedIds.length>20||
    new Set(selectedIds).size!==selectedIds.length){
  return {valid:false,duration:0,totalPrice:null,remaining:target};
 }
 const catalog=new Map(services.map(s=>[Number(s.id),s]));
 let duration=0,cents=0;
 for(const id of selectedIds){
  if(!Number.isSafeInteger(id)||!catalog.has(id))
   return {valid:false,duration:0,totalPrice:null,remaining:target};
  const service=catalog.get(id),minutes=Number(service.duration_minutes),price=centsOf(service.price);
  if(!Number.isSafeInteger(minutes)||minutes<=0||minutes%5!==0||price===null)
   return {valid:false,duration:0,totalPrice:null,remaining:target};
  duration+=minutes;cents+=price;
 }
 const totalPrice=selectedIds.length&&Number.isSafeInteger(cents)?(cents/100).toFixed(2):null;
 return {valid:!!totalPrice && duration===target,duration,totalPrice,
  remaining:target-duration};
}
