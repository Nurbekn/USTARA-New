// The private QR receipt is an authorization secret. Accept only the fields
// needed for the guest's own queue UI; never render untrusted server extras.
const validId = value => Number.isInteger(value) && value >= 1 && value <= 2_147_483_647;
const validTime = value => typeof value === 'string' &&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
 Number.isFinite(Date.parse(value)) && new Date(value).toISOString().startsWith(value.slice(0,19));
const validWait = wait => wait === null || (wait && typeof wait === 'object' && !Array.isArray(wait) &&
 Number.isInteger(wait.min_minutes) && wait.min_minutes >= 0 && wait.min_minutes <= 1440 &&
 Number.isInteger(wait.max_minutes) && wait.max_minutes >= wait.min_minutes && wait.max_minutes <= 1440 &&
 wait.approximate === true && wait.min_minutes % 5 === 0 && wait.max_minutes % 5 === 0);
const validStatus = new Set(['pending','approved','rejected','expired','cancelled']);
const validQueueStatus = new Set(['waiting','called','arrived','in_service','served','missed','left']);

export function parseQrQueueStatus(data) {
 if (!data || typeof data !== 'object' || Array.isArray(data) || !validStatus.has(data.status)) return null;
 if (data.status !== 'approved') return {status:data.status};
 if (data.queue_status !== null && !validQueueStatus.has(data.queue_status)) return null;
 if (typeof data.telegram_linked !== 'boolean' || typeof data.offers_enabled !== 'boolean') return null;
 if (data.offers_enabled && !data.telegram_linked) return null;
 if (data.position !== null && (!validId(data.position) || data.queue_status !== 'waiting')) return null;
 if (!validWait(data.estimated_wait)) return null;
 if (data.queue_status !== 'waiting' && data.estimated_wait !== null) return null;
 if (data.position === null && data.estimated_wait !== null) return null;
 let smart_offer = null;
 if (data.smart_offer !== null) {
  const f = data.smart_offer;
  if (data.queue_status !== 'waiting' || !f || typeof f !== 'object' || Array.isArray(f) ||
   !validId(f.id) || !['pending','accepted'].includes(f.status) ||
   !validTime(f.starts_at) || !validTime(f.expires_at) ||
   (f.status === 'accepted' ? !validTime(f.confirmation_deadline) : f.confirmation_deadline !== null)) return null;
  smart_offer={id:f.id,status:f.status,starts_at:f.starts_at,expires_at:f.expires_at,
   confirmation_deadline:f.status === 'accepted' ? f.confirmation_deadline : null};
 }
 return {status:'approved',queue_status:data.queue_status,position:data.position,
  estimated_wait:data.estimated_wait ? {min_minutes:data.estimated_wait.min_minutes,
   max_minutes:data.estimated_wait.max_minutes,approximate:true} : null,
  telegram_linked:data.telegram_linked,offers_enabled:data.offers_enabled,smart_offer};
}
