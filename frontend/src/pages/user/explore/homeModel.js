import { distanceKm } from './catalog.js';

// Public navigation must not offer an action when the barber has not
// published any selectable services. Never infer a booking from a profile.
export function canBookBarber(barber) {
  return Array.isArray(barber?.services) && barber.services.some(service =>
    Number.isSafeInteger(service?.id) && service.id > 0);
}
export function rankBarbers(barbers, following = [], location) {
  const ids = new Set(following);
  return [...barbers].sort((a, b) => Number(ids.has(`barber:${b.id}`)) - Number(ids.has(`barber:${a.id}`)) || distanceKm(location, a.location) - distanceKm(location, b.location) || a.id - b.id);
}
export function activeBookings(bookings, now = Date.now()) {
  return bookings.filter(booking => ['pending', 'confirmed'].includes(booking.status) && (Date.parse(booking.startsAt) >= now || Date.parse(booking.endsAt) > now)).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}


// #38: a followed provider can be featured only when an approved directory row
// actually exists. The social feed is an identity signal, never a profile source.
export function verifiedHomeFollowing(value, barbers) {
  if (!Array.isArray(value) || !Array.isArray(barbers))
    throw new Error('Kuzatuvlar ro‘yxati noto‘g‘ri qaytdi.');
  const published = new Set(barbers.map(barber => barber.id));
  const result = [], seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || !/^barber:[1-9]\d*$/.test(item))
      throw new Error('Kuzatuvlar ro‘yxati noto‘g‘ri qaytdi.');
    const id = Number(item.slice(7));
    if (!Number.isSafeInteger(id) || id > 2147483647)
      throw new Error('Kuzatuvlar ro‘yxati noto‘g‘ri qaytdi.');
    if (published.has(id) && !seen.has(id)) { seen.add(id); result.push(item); }
  }
  return result;
}

export function homeBarberSections(barbers, following, location, limit = 6) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 24)
    throw new Error('Bosh sahifa limiti noto‘g‘ri.');
  const valid = verifiedHomeFollowing(following, barbers);
  const ordered = rankBarbers(barbers, valid, location);
  const topFollowing = ordered.filter(barber => valid.includes(`barber:${barber.id}`)).slice(0, limit);
  const topIds = new Set(topFollowing.map(barber => barber.id));
  return { all: ordered, topFollowing, rest: ordered.filter(barber => !topIds.has(barber.id)), following: valid };
}

export function verifiedHomePromotions(value, barbers) {
  if (!Array.isArray(value)) throw new Error('Reklama ro‘yxati noto‘g‘ri qaytdi.');
  const available = new Set(barbers.map(barber => barber.id));
  const ids = new Set();
  for (const item of value) {
    const valid = (typeof item === 'number' && Number.isSafeInteger(item))
      || (typeof item === 'string' && /^[1-9]\d*$/.test(item));
    if (!valid || !Number.isSafeInteger(Number(item)) || Number(item) > 2147483647 || Number(item) <= 0)
      throw new Error('Reklama ro‘yxati noto‘g‘ri qaytdi.');
    if (available.has(Number(item))) ids.add(Number(item));
  }
  return [...ids];
}

// Include token identity to reject a different sign-in to the *same* account.
// Do not persist, log or render this value.
export function homeSessionIdentity(session) {
  return session?.role === 'customer' && Number.isSafeInteger(session.accountId)
    && session.accountId > 0 && Number.isSafeInteger(session.profileId)
    && session.profileId > 0 && typeof session.token === 'string' && session.token.length > 0
      ? `${session.accountId}:${session.profileId}:${session.token}` : null;
}
