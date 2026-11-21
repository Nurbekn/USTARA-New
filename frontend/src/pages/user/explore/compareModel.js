import { bookingProfileQuery, distanceKm, knownNumber, listingPrice, nameOf, servicesFor, validPoint } from "./catalog.js";

// #95: A comparison is temporary UI state, not a booking or a stored preference.
const validId = (value) => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;

function publishedItems(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  return items.filter(item => {
    if (!item || !validId(item.id) || seen.has(item.id)
      || (item.verification_status != null && item.verification_status !== "approved")) return false;
    seen.add(item.id);
    return true;
  });
}

// Only the current, filtered search results are eligible; never trust an ID
// from an old search, a link or an unrelated user session.
export function visibleCompareIds(selected, results, max = 3) {
  if (!Number.isInteger(max) || max < 2 || max > 3 || !Array.isArray(selected)) return [];
  const allowed = new Set(publishedItems(results).map(item => item.id));
  const seen = new Set();
  const safe = [];
  for (const id of selected) {
    if (validId(id) && allowed.has(id) && !seen.has(id) && safe.length < max) {
      safe.push(id);
      seen.add(id);
    }
  }
  return safe;
}

export function toggleComparedBarber(selected, id, results) {
  const safe = visibleCompareIds(selected, results);
  if (!validId(id) || !publishedItems(results).some(item => item.id === id)) return safe;
  if (safe.includes(id)) return safe.filter(value => value !== id);
  return safe.length < 3 ? [...safe, id] : safe;
}

export function comparisonRows(selected, results, catalog, selectedServiceId = null, location = null) {
  if (!catalog || !Array.isArray(catalog.services)) return [];
  const safe = visibleCompareIds(selected, results);
  const byId = new Map(publishedItems(results).map(item => [item.id, item]));
  return safe.map(id => {
    const barber = byId.get(id);
    const offered = servicesFor(barber, "barbers", catalog);
    // If the filter specifies one service, show ONLY its price, not the
    // provider's cheapest different service. The same ID goes into booking.
    const matching = selectedServiceId != null && selectedServiceId !== ""
      ? offered.some(service => String(service.id) === String(selectedServiceId))
      : true;
    if (!matching) return null;
    const price = listingPrice(barber, "barbers", catalog, selectedServiceId);
    const d = validPoint(location) && validPoint(barber.location)
      ? distanceKm(location, barber.location) : null;
    const rating = knownNumber(barber.rating) && barber.rating <= 5 ? barber.rating : null;
    const ratingCount = Number.isSafeInteger(barber.reviewCount) && barber.reviewCount >= 0
      ? barber.reviewCount : null;
    return {
      id,
      name: nameOf(barber, "barbers"),
      address: typeof barber.address === "string" && barber.address.trim() ? barber.address.trim() : null,
      priceMin: knownNumber(price.min) ? price.min : null,
      priceMax: knownNumber(price.max) && knownNumber(price.min) && price.max >= price.min ? price.max : null,
      serviceCount: offered.length,
      rating,
      ratingCount,
      distanceKm: d != null && Number.isFinite(d) ? d : null,
      profileUrl: `/user/barbers/${id}`,
      bookingUrl: offered.length > 0 ? `/user/barbers/${id}?${bookingProfileQuery(selectedServiceId == null ? null : String(selectedServiceId), offered)}` : null,
    };
  }).filter(Boolean);
}
