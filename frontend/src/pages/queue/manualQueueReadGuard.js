// Trust only the minimal manual-queue contract returned by this customer's API.
// Invalid records must never render action buttons with attacker-supplied IDs.
const validId = v => Number.isInteger(v) && v >= 1 && v <= 2_147_483_647;
const validDate = v => typeof v === 'string' && Number.isFinite(Date.parse(v));

export function parseManualQueueEntries(payload) {
 if (!payload || typeof payload !== 'object' || Array.isArray(payload)
     || !Array.isArray(payload.entries) || payload.entries.length > 10) return null;
 const seen = new Set();
 const entries = [];
 for (const raw of payload.entries) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
      || !validId(raw.id) || !validId(raw.barber_id)
      || !['waiting','called','arrived','in_service'].includes(raw.status)
      || (raw.queue_position != null && (!Number.isInteger(raw.queue_position)
        || raw.queue_position < 1 || raw.queue_position > 2_147_483_647))
      || seen.has(raw.id)) return null;
  seen.add(raw.id);
  let offer = null;
  if (raw.smart_offer != null) {
   const f = raw.smart_offer;
   if (raw.status !== 'waiting' || !f || typeof f !== 'object'
       || Array.isArray(f) || !validId(f.id)
       || !['pending','accepted'].includes(f.status)
       || !validDate(f.starts_at) || !validDate(f.expires_at)
       || (f.status === 'accepted' && !validDate(f.confirmation_deadline))) return null;
   offer = { id:f.id, status:f.status, starts_at:f.starts_at,
    expires_at:f.expires_at, confirmation_deadline:f.status==='accepted'?f.confirmation_deadline:null };
  }
  entries.push({id:raw.id,barber_id:raw.barber_id,status:raw.status,
   queue_position:raw.queue_position??null,smart_offer:offer});
 }
 return entries;
}
