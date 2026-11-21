// v176 (#145): read-only filters over bookings ALREADY loaded for this barber.
// Never search across accounts, never query by phone, never mutate booking status.
import {validTimelineDay} from './bookingTimelineV160.js';

export const INBOX_SEARCH_LIMIT_V176 = 80;
const clean = (value) => String(value ?? '').normalize('NFKC').toLocaleLowerCase('uz')
  .replace(/\s+/g,' ').trim();

export function filterBookingInboxV176(bookings, {query='',date=''}={}) {
  if (!Array.isArray(bookings)) return [];
  const q=clean(typeof query === 'string' ? query.slice(0,INBOX_SEARCH_LIMIT_V176) : '');
  const day=typeof date === 'string' && validTimelineDay(date) ? date : '';
  return bookings.filter((booking) => {
    if (!booking || typeof booking !== 'object') return false;
    if (day && booking.date !== day) return false;
    if (!q) return true;
    // Do NOT include booking.phone, personal notes, tokens or raw API response fields.
    const searchable=[booking.customer,booking.service,`#${booking.id}`]
      .filter(value => typeof value === 'string' || typeof value === 'number')
      .map(clean);
    return searchable.some(value=>value.includes(q));
  });
}
