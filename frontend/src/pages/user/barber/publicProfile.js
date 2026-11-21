import { request, resolveMediaUrl } from "../../../api/client.js";

export async function loadBarberProfile(id, { token, signal } = {}) {
  const barberId = /^\d+$/.test(String(id)) ? Number(id) : NaN;
  if (!Number.isSafeInteger(barberId) || barberId <= 0) {
    throw Object.assign(new Error("Sartarosh profili topilmadi"), { status: 404 });
  }
  const barber = await request("GET", `/api/barbers/${barberId}`, { token, signal });
  if (!barber || barber.id !== barberId
    || !(barber.phone == null || (typeof barber.phone === "string" && /^\+[1-9][0-9]{7,14}$/.test(barber.phone)))
    || ![barber.first_name, barber.last_name, barber.salon_name, barber.address, barber.bio, barber.avatar_url]
      .every((value) => value == null || typeof value === "string")
    || !((barber.latitude == null && barber.longitude == null)
      || (Number.isFinite(barber.latitude) && Number.isFinite(barber.longitude)
        && Math.abs(barber.latitude) <= 90 && Math.abs(barber.longitude) <= 180))
    || !(barber.experience_years == null || (Number.isInteger(barber.experience_years) && barber.experience_years >= 0 && barber.experience_years <= 99))
    || !(barber.certificates == null || (Array.isArray(barber.certificates) && barber.certificates.length <= 5 && barber.certificates.every(c => c && typeof c.title === "string" && c.title.length <= 80 && typeof c.issuer === "string" && c.issuer.length <= 80 && Number.isInteger(c.year) && c.year >= 1950 && c.year <= new Date().getUTCFullYear())))) {
    throw new Error("Serverdan sartarosh profili olinmadi.");
  }
  let services;
  try {
    services = await request("GET", `${token ? '/api/services' : '/api/services/public'}?barber_id=${barberId}`, { token, signal });
  } catch (error) {
    error.resource = "services";
    throw error;
  }
  if (!Array.isArray(services) || services.some((service) => !service
    || !Number.isInteger(service.id) || service.id <= 0 || service.barber_id !== barberId
    || typeof service.name !== "string" || !Number.isInteger(service.duration_minutes) || service.duration_minutes <= 0
    || !["string", "number"].includes(typeof service.price)
    || !Number.isFinite(Number(service.price)) || Number(service.price) <= 0)) {
    throw new Error("Serverdan xizmatlar ro‘yxati olinmadi.");
  }
  const resources = await Promise.allSettled([
    request("GET", `/api/barbers/${barberId}/portfolio`, { token, signal }),
    request("GET", `/api/barbers/${barberId}/reviews`, { token, signal }),
    request("GET", `/api/barbers/${barberId}/working-hours`, { token, signal }),
  ]);
  signal?.throwIfAborted();
  const [portfolio, review, schedule] = resources;
  const errors = {};
  const portfolioResult = portfolio.status === 'fulfilled' ? portfolio.value : null;
  const reviewResult = review.status === 'fulfilled' ? review.value : null;
  const hours = schedule.status === 'fulfilled' ? schedule.value : null;
  if (!Array.isArray(portfolioResult?.posts)) errors.posts = 'Postlarni yuklab bo‘lmadi.';
  if (!Array.isArray(reviewResult?.reviews) || !Number.isInteger(reviewResult?.summary?.count) || !Number.isFinite(reviewResult?.summary?.average)) errors.reviews = 'Sharhlarni yuklab bo‘lmadi.';
  const validPosts = Array.isArray(portfolioResult?.posts) && portfolioResult.posts.every((post) =>
    post && Number.isSafeInteger(post.id) && post.id > 0 && Array.isArray(post.media) &&
    post.media.every((media) => media && (media.type === 'image' || media.type === 'video') &&
      typeof media.url === 'string' && (
        /^\/api\/media\/[1-9]\d*$/.test(media.url) || /^https:\/\/[^\s]+$/i.test(media.url)
      )));
  if (!validPosts) errors.posts = 'Postlarni yuklab bo‘lmadi.';
  const validHours = Array.isArray(hours) && hours.every(day => Number.isInteger(day.day_of_week) && day.day_of_week >= 0 && day.day_of_week <= 6 && /^([01]\d|2[0-3]):[0-5]\d/.test(day.start_time) && /^([01]\d|2[0-3]):[0-5]\d/.test(day.end_time));
  if (!validHours) errors.hours = 'Ish jadvalini yuklab bo‘lmadi.';
  return { barber: { ...barber, ...(barber.avatar_url ? { avatar_url: resolveMediaUrl(barber.avatar_url) } : {}) }, details: {
    services: services.map(service => ({ ...service, price: Number(service.price) })),
    posts: errors.posts ? [] : portfolioResult.posts.map(post => ({ ...post, media: Array.isArray(post.media) ? post.media.map(media => ({ ...media, url: resolveMediaUrl(media.url) })) : [] })),
    reviews: errors.reviews ? [] : reviewResult.reviews,
    reviewSummary: errors.reviews ? { count: 0, average: 0 } : reviewResult.summary,
    hours: validHours ? hours.map(day => ({ ...day, start_time: day.start_time.slice(0,5), end_time: day.end_time.slice(0,5) })) : [], errors,
  } };
}
