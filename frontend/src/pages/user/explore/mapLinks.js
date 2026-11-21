import { bookingProfileQuery, validPoint } from "./catalog.js";

export function mappedBarbers(barbers) {
  return (Array.isArray(barbers) ? barbers : []).filter(barber =>
    Number.isSafeInteger(barber?.id) && barber.id > 0 && validPoint(barber.location));
}

export function mapProfileHref(barber, prefix = "/user") {
  return Number.isSafeInteger(barber?.id) && barber.id > 0
    ? `${prefix}/barbers/${barber.id}` : null;
}

export function mapBookingHref(barber, selectedServiceId, prefix = "/user") {
  const profile = mapProfileHref(barber, prefix);
  const services = Array.isArray(barber?.services) ? barber.services : [];
  if (!profile || !services.some(service => Number.isSafeInteger(service?.id) && service.id > 0))
    return null;
  return `${profile}?${bookingProfileQuery(selectedServiceId, services)}`;
}
