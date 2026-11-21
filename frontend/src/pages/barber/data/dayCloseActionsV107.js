// A preview only grants permission to request a fresh server-side recheck.
// All writes are authorized, serialized and validated again by the backend.
const validDay = date => typeof date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  && !Number.isNaN(Date.parse(date+'T12:00:00Z'))
  && new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;
const parsedTime = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ? Date.parse(value) : NaN;
const previewValid = preview => validDay(preview?.queue_date) && Number.isFinite(parsedTime(preview.as_of))
  && new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'})
    .format(new Date(preview.as_of))===preview.queue_date;
export function dayCloseIntent(preview,session,epoch,now=Date.now()){
 if(!previewValid(preview) || preview.closed || !preview.ready || !Array.isArray(preview.blockers) || preview.blockers.length!==0
   || (!Number.isSafeInteger(preview.revision) || preview.revision<0)
   || typeof session?.token!=='string' || !session.token
   || session.role!=='barber' || !Number.isSafeInteger(epoch)
   || now<parsedTime(preview.as_of) || now-parsedTime(preview.as_of)>30000)return null;
 return {token:session.token,epoch,expires:parsedTime(preview.as_of)+30000,
   body:{expected_date:preview.queue_date,expected_revision:preview.revision,
     reviewed_at:preview.as_of,confirm:'CLOSE'}};
}
export function dayReopenIntent(preview,session,epoch,now=Date.now()){
 const asOf=parsedTime(preview?.as_of);
 if(!previewValid(preview) || !preview.closed || (!Number.isSafeInteger(preview.revision) || preview.revision<1)
   || typeof session?.token!=='string' || !session.token || session.role!=='barber'
   || !Number.isSafeInteger(epoch) || now<asOf || now-asOf>30000)return null;
 return {token:session.token,epoch,expires:asOf+30000,body:{expected_date:preview.queue_date,
   expected_revision:preview.revision,reviewed_at:preview.as_of,confirm:'REOPEN'}};
}
export function sameDayAction(intent,session,epoch,now=Date.now()){
 return !!intent && session?.role==='barber' && session.token===intent.token
   && epoch===intent.epoch && (!intent.expires || now<=intent.expires);
}
