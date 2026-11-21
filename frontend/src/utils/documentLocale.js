// USTARA v151: route-aware, public-only document metadata for screen readers,
// browser tabs and navigation. No customer/barber/OTP data enters metadata.
import { readSiteLocale } from './siteLocale.js';

export const DOCUMENT_COPY = Object.freeze({
  uz: Object.freeze({
    title:'Ustara — Sartarosh bron qilish',
    description:'Ustara — o‘zingizga mos sartaroshni toping va navbatni oldindan band qiling.',
    sections:Object.freeze({home:'Bosh sahifa', login:'Kirish', signup:'Ro‘yxatdan o‘tish', recovery:'Hisobni tiklash', otp:'Telefonni tasdiqlash', help:'Yordam markazi', explore:'Sartaroshlarni izlash', barber:'Sartarosh profili', bookings:'Bronlar', profile:'Profil', queue:'Navbat', social:'Ilhom', admin:'Boshqaruv paneli'}),
  }),
  ru: Object.freeze({
    title:'USTARA — Запись к барберу',
    description:'Найдите барбера и забронируйте удобное время на USTARA.',
    sections:Object.freeze({home:'Главная', login:'Вход', signup:'Регистрация', recovery:'Восстановление аккаунта', otp:'Подтверждение телефона', help:'Центр помощи', explore:'Поиск барберов', barber:'Профиль барбера', bookings:'Записи', profile:'Профиль', queue:'Очередь', social:'Идеи', admin:'Панель администратора'}),
  }),
  en: Object.freeze({
    title:'USTARA — Barber booking',
    description:'Find a barber and book an appointment with USTARA.',
    sections:Object.freeze({home:'Home', login:'Sign in', signup:'Sign up', recovery:'Account recovery', otp:'Phone verification', help:'Help center', explore:'Find barbers', barber:'Barber profile', bookings:'Bookings', profile:'Profile', queue:'Queue', social:'Inspiration', admin:'Administration'}),
  }),
});

export function documentSection(pathname) {
  if (typeof pathname !== 'string') return 'home';
  // Route classification is fixed; IDs, search strings and customer names are
  // not interpolated into the document title or description.
  if (pathname === '/admin') return 'admin';
  if (pathname === '/login') return 'login';
  if (pathname.startsWith('/signup')) return 'signup';
  if (pathname === '/forgot-password' || pathname === '/account-recovery') return 'recovery';
  if (pathname === '/otp') return 'otp';
  if (pathname === '/help') return 'help';
  if (pathname === '/explore' || pathname === '/user/explore' || pathname === '/barbers') return 'explore';
  if (/^\/(?:user\/)?barbers\/[1-9]\d*$/.test(pathname)) return 'barber';
  if (pathname.endsWith('/bookings')) return 'bookings';
  if (pathname.endsWith('/queue') || pathname.startsWith('/queue/')) return 'queue';
  if (pathname.endsWith('/social')) return 'social';
  if (pathname.endsWith('/profile') || pathname === '/complete-profile') return 'profile';
  return 'home';
}
export function getDocumentPresentation(pathname, query = '') {
  const lang = readSiteLocale(query);
  const dictionary = DOCUMENT_COPY[lang];
  const section = documentSection(pathname);
  return Object.freeze({
    lang,
    title: section === 'home' ? dictionary.title : `${dictionary.sections[section]} — USTARA`,
    description: dictionary.description,
  });
}
