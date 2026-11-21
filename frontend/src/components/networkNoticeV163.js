// v163 / decision #59 — a browser connectivity signal is NOT a server health proof.
// Never infer successful booking writes, retry mutations, or cache private API data.
export const NETWORK_NOTICE_COPY_V163 = Object.freeze({
  uz: Object.freeze({
    offline: 'Qurilma internetga ulanmagan ko‘rinadi. Ma’lumotlar eskirgan bo‘lishi mumkin.',
    reconnected: 'Qurilma internetga qayta ulandi. Bron yoki to‘lov holatini takrorlashdan oldin serverdan tekshiring.',
    dismiss: 'Yopish',
  }),
  ru: Object.freeze({
    offline: 'Похоже, устройство не подключено к интернету. Данные могут быть устаревшими.',
    reconnected: 'Соединение восстановлено. Проверьте запись на сервере, прежде чем повторять действие.',
    dismiss: 'Закрыть',
  }),
  en: Object.freeze({
    offline: 'Your device appears offline. Information shown may be outdated.',
    reconnected: 'Connection restored. Check the booking status on the server before repeating any action.',
    dismiss: 'Dismiss',
  }),
});
export function networkNoticeStatus({ online, previouslyOffline = false, dismissed = false }) {
  if (online === false) return 'offline';
  if (online === true && previouslyOffline && !dismissed) return 'reconnected';
  return 'hidden';
}
export function networkNoticeCopy(lang = 'uz') {
  return NETWORK_NOTICE_COPY_V163[lang] || NETWORK_NOTICE_COPY_V163.uz;
}
