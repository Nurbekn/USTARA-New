// Build optimistic intents from the last verified barber queue snapshot.
// The server independently verifies ownership, current head and state in a
// transaction; client checks are only a UX guard, never authorization.
const safeQueueId=value=>{
  if(typeof value==='string'&&/^[1-9]\d*$/.test(value))value=Number(value);
  return Number.isSafeInteger(value)&&value>0?value:null;
};
export function callNextIntent(called,waiting){
  if(called||!Array.isArray(waiting)||waiting.length===0)return null;
  const id=safeQueueId(waiting[0]?.id);
  return id?{expected_next_id:id}:null;
}
export function finishIntent(entry,nextStatus){
  const id=safeQueueId(entry?.id),current=entry?.status;
  if(!id||!((current==='called'&&['served','missed','left'].includes(nextStatus))||
             (current==='arrived'&&nextStatus==='left')||
             (current==='in_service'&&nextStatus==='served')||
             (current==='waiting'&&nextStatus==='left')))return null;
  return {id,body:{status:nextStatus,expected_status:current}};
}

// Arrival is explicit for the new UI; legacy call -> start stays supported for old clients.
export function markArrivedIntent(entry){
  const id=safeQueueId(entry?.id);
  return id&&entry?.status==='called' ? {id,body:{expected_status:'called'}} : null;
}
export function startServiceIntent(entry){
  const id=safeQueueId(entry?.id);
  return id&&['called','arrived'].includes(entry?.status) ? {id,body:{expected_status:entry.status}} : null;
}
