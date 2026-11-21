import { profileName } from "../../../utils/profileName.js";
/**
 * Barber API javobini Explore katalog shakliga moslaydi.
 * Barber xizmatlari serverdan keladi; salonlar ushbu API bilan ulanmagan.
 * Reyting, sharh, viloyat va bandlik manbasi bo‘lmasa, ular taxmin qilinmaydi.
 */
export async function loadExploreCatalog({ signal, token } = {}) {
  signal?.throwIfAborted();
  // So‘rov transportini faqat ma’lumot yuklanganda import qilamiz.
  const { request } = await import("../../../api/client.js");
  const barbers = await request("GET", "/api/barbers", { token, signal });
  if (!Array.isArray(barbers) || barbers.some((barber) => !barber
    || !Number.isInteger(barber.id) || barber.id <= 0
    || ![barber.first_name, barber.last_name].every((name) => name === null || typeof name === "string")
    || (barber.services != null && !Array.isArray(barber.services)))) {
    throw new Error("Serverdan barberlar ro‘yxati olinmadi.");
  }
  // Endpoint faqat approved profillarni beradi; aniq boshqa holat bo‘lsa chiqarilmaydi.
  const approved = barbers.filter(barber => barber.verification_status == null || barber.verification_status === "approved");
  // A duplicated provider row would generate duplicate React keys, misleading
  // search cards and ambiguous booking destinations. Reject the public snapshot.
  const providerIds = new Set();
  for (const barber of approved) {
    if (!Number.isSafeInteger(barber.id) || barber.id <= 0 || barber.id > 2147483647 || providerIds.has(barber.id))
      throw new Error("Serverdan sartaroshlar ro‘yxati noto‘g‘ri qaytdi.");
    providerIds.add(barber.id);
  }
  // Reject inconsistent published service records instead of showing an invented
  // price or provider relationship in a public search result.
  const seenServiceIds = new Set();
  const services = [];
  for (const barber of approved) {
    if (barber.startingPrice !== undefined && barber.startingPrice !== null && !knownNumber(barber.startingPrice))
      throw new Error("Serverdan xizmat narxlari noto‘g‘ri qaytdi.");
    if (barber.serviceIds != null && (!Array.isArray(barber.serviceIds)
      || barber.serviceIds.some(id => !Number.isSafeInteger(id) || id <= 0)))
      throw new Error("Serverdan xizmatlar ro‘yxati noto‘g‘ri qaytdi.");
    const listedIds = new Set((barber.services || []).map(service => service?.id));
    if (barber.serviceIds != null && (listedIds.size !== barber.serviceIds.length
      || barber.serviceIds.some(id => !listedIds.has(id))))
      throw new Error("Serverdan xizmatlar ro‘yxati noto‘g‘ri qaytdi.");
    for (const service of barber.services || []) {
      if (!service || typeof service !== "object" || Array.isArray(service)
        || !Number.isSafeInteger(service.id) || service.id <= 0
        || typeof service.name !== "string" || !service.name.trim()
        || (service.minPrice != null && !knownNumber(service.minPrice))
        || (service.maxPrice != null && !knownNumber(service.maxPrice))
        || (service.minPrice != null && service.maxPrice != null && service.minPrice > service.maxPrice)
        || !Array.isArray(service.barberIds)
        || !service.barberIds.includes(barber.id)
        || service.barberIds.some(id => id !== barber.id)
        || seenServiceIds.has(service.id))
        throw new Error("Serverdan xizmatlar ro‘yxati noto‘g‘ri qaytdi.");
      seenServiceIds.add(service.id);
      services.push(service);
    }
  }
  return { barbers: approved, salons: [], services };
}

export const EMPTY_CATALOG = { barbers: [], salons: [], services: [] };
export const TYPES = {
  barbers: "Sartaroshlar",
  salons: "Salonlar",
  services: "Xizmatlar",
};
export const REGIONS = [
  "Toshkent shahri",
  "Toshkent",
  "Andijon",
  "Buxoro",
  "Farg‘ona",
  "Jizzax",
  "Namangan",
  "Navoiy",
  "Qashqadaryo",
  "Samarqand",
  "Sirdaryo",
  "Surxondaryo",
  "Xorazm",
  "Qoraqalpog‘iston Respublikasi",
];
export const FILTER_KEYS = [
  "region",
  "area",
  "min",
  "max",
  "rating",
  "distance",
  "available",
  "category",
  "service",
];
export const nameOf = (item, type) =>
  (type === "barbers" ? profileName(item) : item.name || profileName(item)) || "Nomi kiritilmagan";
const same = (a, b) => a != null && b != null && String(a) === String(b);
const includes = (ids, id) =>
  Array.isArray(ids) && ids.some((value) => same(value, id));
export const knownNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
export const validPoint = (p) =>
  !!p &&
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lng) <= 180;
export function normalizeCatalog(data) {
  if (
    !data ||
    !["barbers", "salons", "services"].every((key) => Array.isArray(data[key]))
  )
    throw new Error("Invalid catalog");
  return Object.fromEntries(
    Object.keys(TYPES).map((key) => [
      key,
      data[key].filter((item) => item && item.id != null),
    ]),
  );
}
export function providersFor(service, catalog) {
  return {
    barbers: catalog.barbers.filter(
      (p) =>
        includes(service.barberIds, p.id) || includes(p.serviceIds, service.id),
    ),
    salons: catalog.salons.filter(
      (p) =>
        includes(service.salonIds, p.id) || includes(p.serviceIds, service.id),
    ),
  };
}
export function servicesFor(provider, type, catalog) {
  return catalog.services.filter(
    (service) =>
      includes(provider.serviceIds, service.id) ||
      includes(
        service[type === "barbers" ? "barberIds" : "salonIds"],
        provider.id,
      ),
  );
}
export function distanceKm(a, b) {
  if (!validPoint(a) || !validPoint(b)) return Infinity;
  const rad = (n) => (n * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) *
      Math.cos(rad(b.lat)) *
      Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
// Qidiruv faqat server qaytargan ochiq ma'lumotlardan foydalanadi.
// Viloyat yoki tumanni koordinata orqali taxmin qilmaymiz.
const text = (value) =>
  String(value ?? "")
    .toLocaleLowerCase("uz-Latn-UZ")
    .replace(/[‘’ʻʼ`]/g, "'")
    .replace(/[.,\/\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const matchesTerms = (haystack, query) =>
  text(query).split(" ").filter(Boolean).every((term) => text(haystack).includes(term));

// #164: only suggest district segments explicitly WRITTEN in published addresses.
// No reverse geocoding and no guessing from coordinates, names or browser position.
export function publishedDistrictSuggestions(catalog, limit = 20) {
  const unique = new Map();
  if (!Array.isArray(catalog?.barbers)) return [];
  for (const barber of catalog.barbers) {
    if (typeof barber?.address !== "string") continue;
    for (const part of barber.address.split(",")) {
      const district = part.trim();
      if (district.length < 3 || district.length > 80 ||
          !/(?:^|\s)(?:tumani|tuman|district)(?:$|\s)/iu.test(district)) continue;
      const key = text(district);
      if (!unique.has(key)) unique.set(key, district);
    }
  }
  return [...unique.values()].sort((a,b) => a.localeCompare(b, "uz")).slice(0,
    Number.isInteger(limit) && limit >= 0 ? Math.min(limit, 50) : 20);
}

// #16: Relevance is based only on published profile fields, not inferred ratings.
// Tie breaks preserve the API's original order.
export const SORT_KEYS = ["relevance", "price_asc", "price_desc", "name", "distance_asc"];
export function searchScore(item, type, services, query) {
  const tokens = text(query).split(" ").filter(Boolean);
  if (!tokens.length) return 0;
  const fields = type === "services"
    ? [[item.name, 15], [item.category, 8], [item.description, 3]]
    : [[nameOf(item, type), 15], [item.salonName || item.salon_name, 9],
       [item.specialty, 8], [services.map((service) => service.name).join(" "), 7],
       [item.address, 3]];
  return tokens.reduce((sum, token) => {
    const match = fields.find(([value]) => text(value).includes(token));
    return sum + (match?.[1] || 0);
  }, 0) + (text(fields[0][0]).includes(text(query)) ? 12 : 0);
}

// A service-filtered search can open booking with that exact service preselected.
// Selection is not a booking; InlineBooking still requires an explicit confirmation.
export function bookingProfileQuery(selectedServiceId, providerServices) {
  const params = new URLSearchParams({ tab: "services" });
  if (Array.isArray(providerServices) && providerServices.some(service =>
    Number.isSafeInteger(service?.id) && String(service.id) === selectedServiceId))
    params.set("services", selectedServiceId);
  return params.toString();
}

// Price context follows the selected service, not the cheapest unrelated
// service of the same barber. A missing server price stays unknown.
export function listingPrice(item, type, catalog, serviceId = null) {
  if (type === "services") return {
    min: knownNumber(item.minPrice) ? item.minPrice : null,
    max: knownNumber(item.maxPrice) ? item.maxPrice : null,
  };
  const selected = servicesFor(item, type, catalog)
    .filter(service => serviceId == null || serviceId === "" || same(service.id, serviceId));
  const mins = selected.map(service => service.minPrice).filter(knownNumber);
  const maxs = selected.map(service => service.maxPrice).filter(knownNumber);
  if (serviceId == null || serviceId === "") {
    if (knownNumber(item.startingPrice)) mins.push(item.startingPrice);
  }
  const min = mins.length ? Math.min(...mins) : maxs.length ? Math.min(...maxs) : null;
  const max = maxs.length ? Math.max(...maxs) : min;
  return { min, max };
}

// A malformed bookmarked URL must not silently turn into a broader search.
export function validExploreFilters(params) {
  // Ambiguous bookmarked filters must not silently expand into a wider search.
  const unique = ["q", "region", "area", "min", "max", "rating", "distance",
    "available", "category", "service", "sort", "map", "type", "profile"];
  if (unique.some(key => params.getAll(key).length > 1)) return false;
  if (!validPriceRange(params)) return false;
  if (["q", "area", "region", "category"].some(key => (params.get(key) || "").length > 160)) return false;
  if (params.has("type") && !["", "barbers"].includes(params.get("type"))) return false;
  if (params.has("map") && !["", "1"].includes(params.get("map"))) return false;
  if (params.has("sort") && !["", ...SORT_KEYS].includes(params.get("sort"))) return false;
  const detail = params.get("profile");
  if (detail != null && detail !== "" && (!/^[1-9]\d*$/.test(detail) || !Number.isSafeInteger(Number(detail)))) return false;
  for (const key of ["rating", "distance"]) {
    const raw = params.get(key);
    if (raw == null || raw === "") continue;
    if (!/^\d+(?:\.\d+)?$/.test(raw.trim())) return false;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || (key === "rating" && value > 5)
      || (key === "distance" && value > 20000)) return false;
  }
  const service = params.get("service");
  if (service != null && service !== "" &&
    (!/^[1-9]\d*$/.test(service) || !Number.isSafeInteger(Number(service)))) return false;
  if (params.has("available") && !["", "1"].includes(params.get("available"))) return false;
  return true;
}

export function validPriceRange(params) {
  const parse = (key) => {
    const raw = params.get(key);
    if (raw == null || raw.trim() === "") return { valid: true, value: null };
    if (!/^\d+(?:\.\d+)?$/.test(raw.trim())) return { valid: false };
    const value = Number(raw);
    return { valid: knownNumber(value), value };
  };
  const min = parse("min"), max = parse("max");
  return min.valid && max.valid &&
    (min.value == null || max.value == null || min.value <= max.value);
}
export function selectResults(catalog, type, params, location) {
  if (!validExploreFilters(params)) return [];
  // Distance cannot be ranked from a guessed/default origin.
  if (params.get("sort") === "distance_asc" && (type !== "barbers" || !validPoint(location))) return [];
  const q = text(params.get("q"));
  const area = text(params.get("area"));
  const numeric = (key) => {
    const value = params.get(key);
    return value != null && value.trim() !== "" && knownNumber(Number(value))
      ? Number(value)
      : null;
  };
  const min = numeric("min"),
    max = numeric("max"),
    rating = numeric("rating"),
    distance = numeric("distance");
  const region = params.get("region");
  const serviceId = params.get("service");
  const matchProvider = (p) =>
    (!region || text(p.region) === text(region)) &&
    (!area || matchesTerms(p.address, area)) &&
    (rating == null || (knownNumber(p.rating) && p.rating >= rating)) &&
    (distance == null ||
      (validPoint(location) && distanceKm(location, p.location) <= distance)) &&
    (params.get("available") !== "1" || p.available === true);
  const matchPrice = (low, high) => {
    const lower = knownNumber(low) ? low : high;
    const upper = knownNumber(high) ? high : low;
    return (
      (min == null || (knownNumber(upper) && upper >= min)) &&
      (max == null || (knownNumber(lower) && lower <= max))
    );
  };
  const matched = catalog[type].filter((item) => {
    if (type === "services") {
      const providers = providersFor(item, catalog);
      const needsProvider =
        region ||
        area ||
        rating != null ||
        distance != null ||
        params.get("available") === "1";
      return (
        (!q || matchesTerms(`${item.name} ${item.description} ${item.category}`, q)) &&
        (!params.get("category") || item.category === params.get("category")) &&
        matchPrice(item.minPrice, item.maxPrice) &&
        (!needsProvider ||
          [...providers.barbers, ...providers.salons].some(matchProvider))
      );
    }
    const services = servicesFor(item, type, catalog);
    const price = listingPrice(item, type, catalog, serviceId);
    return (
      matchProvider(item) &&
      (!serviceId || services.some((s) => same(s.id, serviceId))) &&
      matchPrice(price.min, price.max) &&
      (!q || matchesTerms(
        `${nameOf(item, type)} ${item.salonName || ""} ${item.specialty || ""} ${item.address || ""} ${services.map((s) => s.name).join(" ")}`,
        q,
      ))
    );
  }).map((item, index) => ({ item, index }));
  const requestedSort = params.get("sort");
  const sort = SORT_KEYS.includes(requestedSort) ? requestedSort : "relevance";
  const sorted = matched;
  // Explicit price/name sorting is deterministic. Missing prices always go last.
  if (sort === "price_asc" || sort === "price_desc") {
    sorted.sort((a, b) => {
      const first = listingPrice(a.item, type, catalog, serviceId).min;
      const second = listingPrice(b.item, type, catalog, serviceId).min;
      if (first === null) return second === null ? a.index - b.index : 1;
      if (second === null) return -1;
      return (sort === "price_asc" ? first - second : second - first) || a.index - b.index;
    });
  } else if (sort === "distance_asc") {
    // A missing published coordinate is unknown, NEVER zero kilometres away.
    // Equal distances preserve API order, including in a filtered search.
    sorted.sort((a, b) => {
      const first = distanceKm(location, a.item.location);
      const second = distanceKm(location, b.item.location);
      if (!Number.isFinite(first)) return Number.isFinite(second) ? 1 : a.index - b.index;
      if (!Number.isFinite(second)) return -1;
      return first - second || a.index - b.index;
    });
  } else if (sort === "name") {
    sorted.sort((a, b) => text(nameOf(a.item, type)).localeCompare(text(nameOf(b.item, type)), "uz") || a.index - b.index);
  } else if (q) {
    sorted.sort((a, b) => searchScore(b.item, type, type === "services" ? [] : servicesFor(b.item, type, catalog), q)
      - searchScore(a.item, type, type === "services" ? [] : servicesFor(a.item, type, catalog), q)
      || a.index - b.index);
  }
  return sorted.map(({ item }) => item);
}
