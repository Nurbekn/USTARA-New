// USTARA v141 / #76: public and customer/barber navigation copy only.
// Locale never changes authentication, role, API payloads, or business statuses.
export const SITE_LANGUAGES = Object.freeze([
  Object.freeze({ id: 'uz', label: 'O‘zbekcha' }),
  Object.freeze({ id: 'ru', label: 'Русский' }),
  Object.freeze({ id: 'en', label: 'English' }),
]);
const valid = new Set(SITE_LANGUAGES.map(item => item.id));
const copy = {
  uz: {
    language: 'Til', public: { start: 'Boshlash', signIn: 'Kirish', how: 'Qanday ishlaydi?', about: 'Biz haqimizda', contact: 'Bog‘lanish', help: 'Yordam', menuOpen: 'Menyuni ochish', menuClose: 'Menyuni yopish', mainNav: 'Asosiy navigatsiya', signup: 'Ro‘yxatdan o‘tish' },
    footer: { description: 'O‘zingizga mos sartaroshni toping. Navbatingizni oldindan band qiling. Vaqtingizni tejab, uslubingizni yangilang.', platform: 'Platforma', barbers: 'Sartaroshlar', brands: 'Brend konsepsiyalari', account: 'Hisob', signup: 'Ro‘yxatdan o‘tish', email: 'Email yuborish', rights: 'Barcha huquqlar himoyalangan.', motto: 'Sartarosh tanlashning qulay usuli.' },
    customer: { skip: 'Kontentga o‘tish', home: 'Asosiy', barbers: 'Sartaroshlar', inspiration: 'Ilhom', bookings: 'Bronlar', profile: 'Profil', help: 'Yordam', homeLabel: 'USTARA — bosh sahifa', navLabel: 'Mijoz navigatsiyasi', notifications: 'Bildirishnomalar', status: 'Bronlaringiz holati', loading: 'Yuklanmoqda…', error: 'Bronlar yuklanmadi. Oynani qayta ochib ko‘ring.', empty: 'Hozircha bronlaringiz yo‘q.', allBookings: 'Barcha bronlar' },
    barber: { home: 'Bosh', bookings: 'Bronlar', queue: 'Navbat', services: 'Xizmatlar', profile: 'Profil', help: 'Yordam', homeLabel: 'Ustara — bosh sahifa', helpLabel: 'Sartarosh uchun yordam', navLabel: 'Asosiy menyu', loading: 'Sartarosh ma’lumotlari serverdan yuklanmoqda…', error: 'Sartarosh ma’lumotlarini yuklab bo‘lmadi.', retry: 'Qayta urinish' },
  },
  ru: {
    language: 'Язык', public: { start: 'Начать', signIn: 'Войти', how: 'Как это работает?', about: 'О нас', contact: 'Связаться', help: 'Помощь', menuOpen: 'Открыть меню', menuClose: 'Закрыть меню', mainNav: 'Основная навигация', signup: 'Регистрация' },
    footer: { description: 'Найдите подходящего барбера, забронируйте время заранее и обновите свой стиль без долгого ожидания.', platform: 'Платформа', barbers: 'Барберы', brands: 'Концепции бренда', account: 'Аккаунт', signup: 'Регистрация', email: 'Написать письмо', rights: 'Все права защищены.', motto: 'Удобный способ выбрать барбера.' },
    customer: { skip: 'Перейти к содержимому', home: 'Главная', barbers: 'Барберы', inspiration: 'Идеи', bookings: 'Записи', profile: 'Профиль', help: 'Помощь', homeLabel: 'USTARA — главная', navLabel: 'Навигация клиента', notifications: 'Уведомления', status: 'Статус ваших записей', loading: 'Загрузка…', error: 'Не удалось загрузить записи. Откройте окно ещё раз.', empty: 'У вас пока нет записей.', allBookings: 'Все записи' },
    barber: { home: 'Главная', bookings: 'Записи', queue: 'Очередь', services: 'Услуги', profile: 'Профиль', help: 'Помощь', homeLabel: 'Ustara — главная', helpLabel: 'Помощь барберу', navLabel: 'Главное меню', loading: 'Данные барбера загружаются…', error: 'Не удалось загрузить данные барбера.', retry: 'Повторить' },
  },
  en: {
    language: 'Language', public: { start: 'Get started', signIn: 'Sign in', how: 'How it works', about: 'About us', contact: 'Contact', help: 'Help', menuOpen: 'Open menu', menuClose: 'Close menu', mainNav: 'Main navigation', signup: 'Sign up' },
    footer: { description: 'Find a barber that suits you, reserve your spot in advance and save time for your next look.', platform: 'Platform', barbers: 'Barbers', brands: 'Brand concepts', account: 'Account', signup: 'Sign up', email: 'Send email', rights: 'All rights reserved.', motto: 'An easier way to choose a barber.' },
    customer: { skip: 'Skip to content', home: 'Home', barbers: 'Barbers', inspiration: 'Inspiration', bookings: 'Bookings', profile: 'Profile', help: 'Help', homeLabel: 'USTARA — home', navLabel: 'Customer navigation', notifications: 'Notifications', status: 'Your booking status', loading: 'Loading…', error: 'Could not load bookings. Reopen this panel to try again.', empty: 'You have no bookings yet.', allBookings: 'All bookings' },
    barber: { home: 'Home', bookings: 'Bookings', queue: 'Queue', services: 'Services', profile: 'Profile', help: 'Help', homeLabel: 'Ustara — home', helpLabel: 'Help for barbers', navLabel: 'Main menu', loading: 'Loading barber data…', error: 'Could not load barber data.', retry: 'Try again' },
  },
};
export function readSiteLocale(value) {
  const params = value instanceof URLSearchParams ? value : new URLSearchParams(typeof value === 'string' ? value : '');
  const entries = params.getAll('lang');
  return entries.length === 1 && valid.has(entries[0]) ? entries[0] : 'uz';
}
export function getSiteUi(lang = 'uz') {
  return copy[valid.has(lang) ? lang : 'uz'];
}
// Only internal route paths are accepted. We never forward arbitrary URL query state
// (including OTP, JWT, auth codes) from one page to another.
export function siteLocalePath(path, lang = 'uz') {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /[\u0000-\u001f]/.test(path)) return '/';
  const url = new URL(path, 'https://ustara.invalid');
  if (url.origin !== 'https://ustara.invalid') return '/';
  const query = new URLSearchParams(url.search);
  query.delete('lang');
  if (lang === 'ru' || lang === 'en') query.set('lang', lang);
  return `${url.pathname}${query.size ? '?' + query : ''}${url.hash}`;
}
// Language changes retain only safe, page-relevant filters; never passwords, tokens,
// reset codes, or arbitrary parameters. Unknown routes retain only the pathname.
const safeQueries = Object.freeze({
  '/explore': ['type', 'q', 'sort', 'region', 'area', 'min', 'max', 'rating', 'distance', 'available', 'category', 'service', 'map', 'profile'],
  '/user/explore': ['type', 'q', 'sort', 'region', 'area', 'min', 'max', 'rating', 'distance', 'available', 'category', 'service', 'map', 'profile'],
  '/help': ['category', 'topic'],
  '/user/bookings': ['status', 'booking'],
  '/user/social': ['tab', 'q', 'category', 'post'],
  '/user/chat': ['barber', 'thread', 'post'],
  '/barber/chat': ['thread'],
  '/barbers': ['q', 'sort'],
});
export function siteLocaleSwitchUrl(location, nextLang) {
  const pathname = typeof location?.pathname === 'string' && /^\/(?!\/)[^\\\u0000-\u001f]*$/.test(location.pathname) ? location.pathname : '/';
  const source = new URLSearchParams(typeof location?.search === 'string' ? location.search : '');
  const query = new URLSearchParams();
  // Profile URLs can contain a service selection. Preserve only validated, public
  // booking selectors; never forward arbitrary guest/OTP/account query parameters.
  const publicProfile = /^\/(?:user\/)?barbers\/[1-9]\d*$/.test(pathname);
  const allowed = publicProfile ? ['tab', 'services'] : (safeQueries[pathname] || []);
  for (const name of allowed) {
    const entries = source.getAll(name);
    if (entries.length !== 1 || entries[0].length > 100) continue;
    const value = entries[0];
    if (publicProfile && name === 'tab' && !['posts', 'services', 'hours', 'reviews'].includes(value)) continue;
    if (publicProfile && name === 'services' && !(value.length > 0 && value.split(',').length <= 20 && value.split(',').every(id => /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id))) && new Set(value.split(',')).size === value.split(',').length)) continue;
    if (name === 'booking' && !( /^[1-9]\d{0,9}$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647 )) continue;
    if (name === 'status' && !['all', 'upcoming', 'history', 'pending', 'confirmed', 'completed', 'cancelled', 'rejected'].includes(value)) continue;
    if (name === 'tab' && pathname === '/user/social' && !['feed', 'following', 'saved'].includes(value)) continue;
    if (name === 'post' && !( /^[1-9]\d{0,9}$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647 )) continue;
    if (['barber','thread'].includes(name) && !( /^[1-9]\d{0,9}$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647 )) continue;
    if (['service', 'profile'].includes(name) && value && !(/^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)))) continue;
    if (name === 'map' && !['1', ''].includes(value)) continue;
    if (name === 'available' && !['1', ''].includes(value)) continue;
    if (['min', 'max', 'rating', 'distance'].includes(name) && value && !/^\d+(?:\.\d+)?$/.test(value)) continue;
    query.set(name, value);
  }
  return siteLocalePath(`${pathname}${query.size ? '?' + query : ''}`, nextLang);
}
