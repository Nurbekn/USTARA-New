// #131: A filtered *current booking status* view, not a historical push/event log.
// Source is the existing authenticated customer bookings API; no extra personal data.
import { bookingStatusItems } from './notifications.js';

const ACTIVE = new Set(['pending', 'confirmed']);
const HISTORY = new Set(['completed', 'cancelled', 'rejected']);
const LABELS = Object.freeze({
  uz: { pending:'Bron so‘rovingiz yuborildi', confirmed:'Broningiz tasdiqlandi', completed:'Tashrif yakunlandi', cancelled:'Bron bekor qilindi', rejected:'Bron rad etildi' },
  ru: { pending:'Запрос на запись отправлен', confirmed:'Запись подтверждена', completed:'Визит завершён', cancelled:'Запись отменена', rejected:'В записи отказано' },
  en: { pending:'Booking request sent', confirmed:'Booking confirmed', completed:'Visit completed', cancelled:'Booking cancelled', rejected:'Booking rejected' },
});
export const smartNotificationLocaleV174 = Object.freeze({
  uz: { all:'Barchasi', active:'Faol', history:'Yakunlangan', refresh:'Yangilash', explanation:'Serverdagi joriy bron holatlari. Bu yuborilgan xabarlar tarixi emas.', count:'ta bron', emptyFilter:'Bu bo‘limda bron yo‘q.', limited:'Oxirgi 12 ta bron ko‘rsatilmoqda; qolganlari Bronlar sahifasida.' },
  ru: { all:'Все', active:'Активные', history:'Завершённые', refresh:'Обновить', explanation:'Текущие статусы записей с сервера, не история отправленных сообщений.', count:'записей', emptyFilter:'В этом разделе нет записей.', limited:'Показаны последние 12 записей. Остальные доступны в разделе Записи.' },
  en: { all:'All', active:'Active', history:'Past', refresh:'Refresh', explanation:'Current booking statuses from the server, not a history of delivered alerts.', count:'bookings', emptyFilter:'No bookings in this category.', limited:'Showing the latest 12 bookings. See Bookings for the rest.' },
});
export function smartNotificationTextV174(lang) {
  return smartNotificationLocaleV174[lang] || smartNotificationLocaleV174.uz;
}
// Group by server status, NOT the customer's local clock: an overdue confirmed
// booking stays active until the backend updates its status.
export function buildSmartNotificationCenterV174(bookings, { filter='all', lang='uz', maxItems=12 }={}) {
  const statuses = Array.isArray(bookings) ? bookings : [];
  const all = bookingStatusItems(statuses, statuses.length);
  const statusById = new Map(statuses.map(b => [b?.id, b?.status]));
  const active = all.filter(item => ACTIVE.has(statusById.get(item.id)));
  const history = all.filter(item => HISTORY.has(statusById.get(item.id)));
  const selected = filter === 'active' ? active : filter === 'history' ? history : all;
  const safeMax = Number.isInteger(maxItems) && maxItems >= 0 && maxItems <= 100 ? maxItems : 12;
  const label = LABELS[lang] || LABELS.uz;
  return {
    filter: ['all','active','history'].includes(filter) ? filter : 'all',
    counts: { all:all.length, active:active.length, history:history.length },
    items: selected.slice(0,safeMax).map(item => ({ ...item,
      title: label[statusById.get(item.id)] || item.title,
    })),
    truncated: selected.length > safeMax,
  };
}
