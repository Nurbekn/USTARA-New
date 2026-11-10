/**
 * API boundary: replace this function with the catalog request when available.
 * Catalog: { barbers: [], salons: [], services: [] }.
 * Provider: id, name (or firstName/lastName), region, address, location {lat,lng},
 * rating, reviewCount, available (boolean), startingPrice, serviceIds (id[]).
 * Barber: salonName, avatarPhoto, avatar. Salon: image, openingHours.
 * Service: id, name, category, description, minPrice, maxPrice, barberIds, salonIds.
 * IDs are compared as strings. Prices are UZS; absent values stay unknown.
 * Availability and ratings must come from the server, never inferred.
 */
export async function loadExploreCatalog({ signal } = {}) {
  signal?.throwIfAborted();
  return { barbers: [], salons: [], services: [] };
}

export const EMPTY_CATALOG = { barbers: [], salons: [], services: [] };
export const TYPES = { barbers: 'Barberlar', salons: 'Salonlar', services: 'Xizmatlar' };
export const REGIONS = ['Toshkent shahri', 'Toshkent', 'Andijon', 'Buxoro', 'Farg‘ona', 'Jizzax', 'Namangan', 'Navoiy', 'Qashqadaryo', 'Samarqand', 'Sirdaryo', 'Surxondaryo', 'Xorazm', 'Qoraqalpog‘iston Respublikasi'];
export const FILTER_KEYS = ['region', 'min', 'max', 'rating', 'distance', 'available', 'category', 'service'];
export const nameOf = (item) => item.name || [item.firstName, item.lastName].filter(Boolean).join(' ') || 'Nomi kiritilmagan';
const same = (a, b) => a != null && b != null && String(a) === String(b);
const includes = (ids, id) => Array.isArray(ids) && ids.some((value) => same(value, id));
export const knownNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const validPoint = (p) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
export function normalizeCatalog(data) {
  if (!data || !['barbers', 'salons', 'services'].every((key) => Array.isArray(data[key]))) throw new Error('Invalid catalog');
  return Object.fromEntries(Object.keys(TYPES).map((key) => [key, data[key].filter((item) => item && item.id != null)]));
}
export function providersFor(service, catalog) {
  return {
    barbers: catalog.barbers.filter((p) => includes(service.barberIds, p.id) || includes(p.serviceIds, service.id)),
    salons: catalog.salons.filter((p) => includes(service.salonIds, p.id) || includes(p.serviceIds, service.id)),
  };
}
export function servicesFor(provider, type, catalog) {
  return catalog.services.filter((service) => includes(provider.serviceIds, service.id) || includes(service[type === 'barbers' ? 'barberIds' : 'salonIds'], provider.id));
}
function distanceKm(a, b) {
  if (!validPoint(a) || !validPoint(b)) return Infinity;
  const rad = (n) => n * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
const text = (value) => String(value ?? '').toLocaleLowerCase().replace(/[‘’ʻʼ`]/g, "'");
export function selectResults(catalog, type, params, location) {
  const q = text(params.get('q')).trim();
  const numeric = (key) => { const value = params.get(key); return value != null && value.trim() !== '' && knownNumber(Number(value)) ? Number(value) : null; };
  const min = numeric('min'), max = numeric('max'), rating = numeric('rating'), distance = numeric('distance');
  const region = params.get('region');
  const serviceId = params.get('service');
  const matchProvider = (p) => (!region || p.region === region)
    && (rating == null || (knownNumber(p.rating) && p.rating >= rating))
    && (distance == null || (validPoint(location) && distanceKm(location, p.location) <= distance))
    && (params.get('available') !== '1' || p.available === true);
  const matchPrice = (low, high) => {
    const lower = knownNumber(low) ? low : high;
    const upper = knownNumber(high) ? high : low;
    return (min == null || (knownNumber(upper) && upper >= min))
      && (max == null || (knownNumber(lower) && lower <= max));
  };
  return catalog[type].filter((item) => {
    if (type === 'services') {
      const providers = providersFor(item, catalog);
      const needsProvider = region || rating != null || distance != null || params.get('available') === '1';
      return (!q || text(`${item.name} ${item.description} ${item.category}`).includes(q))
        && (!params.get('category') || item.category === params.get('category'))
        && matchPrice(item.minPrice, item.maxPrice)
        && (!needsProvider || [...providers.barbers, ...providers.salons].some(matchProvider));
    }
    const services = servicesFor(item, type, catalog);
    const prices = services.flatMap((s) => [s.minPrice, s.maxPrice]).filter(knownNumber);
    const low = knownNumber(item.startingPrice) ? item.startingPrice : prices.length ? Math.min(...prices) : null;
    const high = prices.length ? Math.max(...prices) : low;
    return matchProvider(item) && matchPrice(low, high)
      && (!serviceId || services.some((s) => same(s.id, serviceId)))
      && (!q || text(`${nameOf(item)} ${item.salonName || ''} ${services.map((s) => s.name).join(' ')}`).includes(q));
  });
}
