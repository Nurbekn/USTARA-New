// v175 / #141 — public barber coordinates only; provider URLs are generated
// from finite, bounded coordinates. Never send names, phone numbers, booking
// details or customer positions to map providers.
import { bookingMapLinks } from '../bookings/navigation.js';

const COPY = Object.freeze({
  uz: { open: 'Xaritada ochish', hint: 'Tanlangan xarita nuqtani ochadi. Yo‘nalishni xarita ilovasida tanlang.' },
  ru: { open: 'Открыть на карте', hint: 'Карта откроет точку. Маршрут выберите в приложении карты.' },
  en: { open: 'Open in maps', hint: 'The map opens the pin. Choose directions in the map app.' },
});

export function publicNavigationTextV175(lang = 'uz') {
  return typeof lang === 'string' && Object.hasOwn(COPY, lang) ? COPY[lang] : COPY.uz;
}

export function publicBarberMapLinksV175(barber) {
  // bookingMapLinks is the existing shared, fail-closed provider URL builder.
  // Missing/invalid coordinates must NOT fall back to guessed address searches.
  return bookingMapLinks({ lat: barber?.latitude, lng: barber?.longitude });
}
