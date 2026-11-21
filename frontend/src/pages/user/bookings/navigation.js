// v125 — build external links only from validated, server-provided booking facts.
// Never put customer phone or an unverified address into another provider's URL.
export function bookingLocation(row) {
  const lat = row?.barber_latitude;
  const lng = row?.barber_longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {lat, lng};
}

export function barberPhone(row) {
  const phone = row?.barber_phone;
  return typeof phone === 'string' && /^\+?[1-9]\d{6,14}$/.test(phone) ? phone : null;
}

export function bookingSalon(row) {
  const name = typeof row?.barber_salon_name === 'string' ? row.barber_salon_name.trim() : '';
  const address = typeof row?.barber_address === 'string' ? row.barber_address.trim() : '';
  const location = bookingLocation(row);
  return name || address || location ? {
    ...(name ? {name: name.slice(0, 200)} : {}),
    ...(address ? {address: address.slice(0, 500)} : {}),
    ...(location ? {location} : {}),
  } : null;
}

export function bookingMapLinks(location) {
  // Web destinations only; avoid a custom URI handler or guessed navigation origin.
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng) ||
      Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180) return [];
  const lat = String(location.lat);
  const lng = String(location.lng);
  return [
    {name: 'Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`},
    {name: 'Yandex Maps', href: `https://yandex.uz/maps/?ll=${lng}%2C${lat}&pt=${lng}%2C${lat}&z=16`},
    {name: '2GIS', href: `https://2gis.uz/geo/${lng},${lat}`},
    {name: 'OpenStreetMap', href: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`},
  ];
}
