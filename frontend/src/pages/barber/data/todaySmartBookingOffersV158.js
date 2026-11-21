// Read-only, owner-scoped Smart Booking timeline view. An accepted offer is
// provisional: ONLY a server-issued booking_id can be presented as a booking.
const states = new Set(['open', 'offered', 'accepted', 'cancelled', 'closed']);
const offerStates = new Set(['pending', 'accepted', 'rejected', 'expired', 'cancelled']);
const deliveryStates = new Set(['pending', 'sending', 'sent', 'failed', 'uncertain', 'cancelled']);
const numericId = value => {
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) value = Number(value);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
  && Number.isFinite(Date.parse(value));
const optionalText = (value, max) => value == null || (typeof value === 'string'
  && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value));

export function parseTodaySmartBookingOffers(data) {
  if (!data || !Array.isArray(data.openings) || data.openings.length > 50) return null;
  const seen = new Set();
  const result = [];
  for (const item of data.openings) {
    const id = numericId(item?.id);
    const bookingId = item?.booking_id == null ? null : numericId(item.booking_id);
    if (!id || seen.has(id) || !states.has(item.state) || !timestamp(item.start_at)
      || !Number.isInteger(item.duration_minutes) || item.duration_minutes < 5
      || item.duration_minutes > 1440 || (item.booking_id != null && !bookingId)
      || !optionalText(item.display_label, 60)
      || (item.expires_at != null && !timestamp(item.expires_at))
      || (item.offer_status != null && !offerStates.has(item.offer_status))
      || (item.telegram_notice_status != null && !deliveryStates.has(item.telegram_notice_status))) return null;
    seen.add(id);
    result.push({ id, state:item.state, start_at:item.start_at,
      duration_minutes:item.duration_minutes, booking_id:bookingId,
      display_label:item.display_label ?? null, expires_at:item.expires_at ?? null,
      telegram_notice_status:item.telegram_notice_status ?? null });
  }
  return result.sort((a,b) => Date.parse(a.start_at)-Date.parse(b.start_at) || a.id-b.id);
}

export function todayOfferDisplayStatus(offer) {
  // Confirmation is proven only by a booking record, never by an accepted invite.
  if (offer?.booking_id) return 'confirmed';
  return states.has(offer?.state) ? offer.state : null;
}

export function todayOfferClock(value, lang='uz') {
  if (!timestamp(value)) return '—';
  return new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-GB' : 'uz-UZ', {
    timeZone:'Asia/Tashkent',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  }).format(new Date(value));
}
