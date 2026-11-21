// Only a validated, minimal queue snapshot may drive barber queue action buttons.
// The owner is enforced by the backend; this guard prevents UI confusion on
// malformed/stale API responses and never forwards unexpected private fields.
const numericId = value => {
  // PostgreSQL BIGINT columns are serialized as decimal strings by node-postgres.
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) value = Number(value);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};
const id = value => numericId(value) !== null;
const text = (value, max) => typeof value === 'string' && value.trim().length > 0
  && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const stamp = value => value == null || (typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)));
const day = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try { return new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value; }
  catch { return false; }
};
const arr = (value,max) => Array.isArray(value) && value.length <= max;
export function parseBarberQueueSnapshot(queue, qr, offers) {
  if (!queue || !qr || !offers || !arr(queue.active,100) || !arr(queue.recent,20)
    || !arr(qr.pending,25) || !arr(offers.openings,50)) return null;
  const seen = new Set();
  const sanitizeEntries = (items, allowed) => {
    const result = [];
    for (const r of items) {
      if (!r || !id(r.id) || seen.has(numericId(r.id)) || !allowed.has(r.status)
        || !text(r.display_label,60) || !day(r.queue_date)
        || (r.queue_position != null && !id(r.queue_position))
        || !stamp(r.created_at) || !stamp(r.called_at) || !stamp(r.arrived_at) || !stamp(r.started_at) || !stamp(r.finished_at)
        || (r.status==='in_service' && (!r.called_at || !r.started_at || r.finished_at))
        || (r.status==='arrived' && (!r.called_at || !r.arrived_at || r.started_at || r.finished_at))
        || (r.status==='called' && (r.arrived_at || r.started_at))
        || (r.status==='waiting' && (r.called_at || r.arrived_at || r.started_at || r.finished_at))
        || (r.is_qr != null && typeof r.is_qr !== 'boolean')
        || (r.manual_linked != null && typeof r.manual_linked !== 'boolean')) return null;
      seen.add(numericId(r.id));
      result.push({id:numericId(r.id),display_label:r.display_label,queue_date:r.queue_date,
        status:r.status,queue_position:r.queue_position??null,
        created_at:r.created_at??null,called_at:r.called_at??null,
        arrived_at:r.arrived_at??null,started_at:r.started_at??null,finished_at:r.finished_at??null,is_qr:r.is_qr===true,manual_linked:r.manual_linked===true});
    }
    return result;
  };
  const active=sanitizeEntries(queue.active,new Set(['waiting','called','arrived','in_service']));
  if (!active) return null;
  const recent=sanitizeEntries(queue.recent,new Set(['served','missed','left']));
  if (!recent) return null;
  const pending=[];
  const qrSeen=new Set();
  for (const r of qr.pending) {
    if (!r || !id(r.id) || qrSeen.has(numericId(r.id)) || !text(r.display_label,60)
      || !stamp(r.created_at) || r.created_at == null) return null;
    qrSeen.add(numericId(r.id));
    pending.push({id:numericId(r.id),display_label:r.display_label,created_at:r.created_at});
  }
  const openings=[];
  const openingsSeen=new Set();
  for (const r of offers.openings) {
    if (!r || !id(r.id) || openingsSeen.has(numericId(r.id))
      || !['open','offered','accepted','cancelled','closed'].includes(r.state)
      || !stamp(r.start_at) || r.start_at == null
      || !Number.isInteger(r.duration_minutes) || r.duration_minutes < 5 || r.duration_minutes > 1440
      || (r.booking_id != null && !id(r.booking_id))
      || (r.display_label != null && !text(r.display_label,60))
      || (r.expires_at != null && !stamp(r.expires_at))
      || (r.telegram_notice_status != null && !['pending','sending','sent','failed','uncertain','cancelled'].includes(r.telegram_notice_status))) return null;
    openingsSeen.add(numericId(r.id));
    openings.push({id:numericId(r.id),state:r.state,start_at:r.start_at,duration_minutes:r.duration_minutes,
      booking_id:r.booking_id==null?null:numericId(r.booking_id),display_label:r.display_label??null,
      expires_at:r.expires_at??null,telegram_notice_status:r.telegram_notice_status??null});
  }
  return {active,recent,pending,openings};
}
