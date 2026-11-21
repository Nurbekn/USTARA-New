// v166: Contextual guidance is advisory, never part of authentication or booking state.
// All destinations are fixed internal routes; URL params from the current page are ignored.
export const GUIDE_ROUTES_V166 = Object.freeze({
  customer: Object.freeze({
    home: { topic: 'search', path: '/user/explore?type=barbers' },
    explore: { topic: 'booking', path: '/user/explore?type=barbers' },
    social: { topic: 'search', path: '/user/social' },
    bookings: { topic: 'bookings', path: '/user/bookings' },
    queue: { topic: 'queue', path: '/user/queue' },
    profile: { topic: 'privacy', path: '/user/profile' },
  }),
  barber: Object.freeze({
    home: { topic: 'barber-profile', path: '/barber/profile' },
    bookings: { topic: 'barber-bookings', path: '/barber/bookings' },
    queue: { topic: 'barber-bookings', path: '/barber/queue' },
    services: { topic: 'barber-profile', path: '/barber/services' },
    profile: { topic: 'barber-profile', path: '/barber/profile' },
    schedule: { topic: 'barber-profile', path: '/barber/schedule' },
  }),
});

const translations = {
  uz: {
    label: 'Sahifa bo‘yicha yordam', open: 'Yo‘riqnomani ko‘rish', hide: 'Yopish', dismiss: 'Shu sessiyada yashirish',
    action: 'Bo‘limga o‘tish', help: 'Batafsil yordam', important: 'Bron faqat server tasdiqlaganidan keyin kuchga kiradi.',
    customer: {
      home: ['Qidiruvdan boshlang', 'Mos sartaroshni xizmat va manzili orqali toping.'],
      explore: ['Sartaroshni tanlang', 'Narx, xizmat va bo‘sh vaqtni tekshiring; keyin bron so‘rovini yuboring.'],
      social: ['Ilhom toping', 'Postlarni ko‘ring, yoqqanini saqlang. Saqlash bron yaratmaydi.'],
      bookings: ['Bronlaringizni tekshiring', 'Tasdiqlangan holatni ko‘ring. Natija noma’lum bo‘lsa, amalni takrorlamang.'],
      queue: ['Navbatni kuzating', 'Kutish vaqti taxminiy. QR taklifini alohida tasdiqlang.'],
      profile: ['Profilni himoyalang', 'Ma’lumotni yangilang va OTP yoki parolingizni hech kimga bermang.'],
    },
    barber: {
      home: ['Ish kuniga tayyorlaning', 'Profil, xizmatlar va ish vaqtini tekshirib chiqing.'],
      bookings: ['Bronlarni boshqaring', 'Holatni tekshiring; mijozga tasdiqlanmagan va’dalar bermang.'],
      queue: ['Navbat holatini tekshiring', 'Mijoz kelganini va xizmat boshlanishini alohida belgilang.'],
      services: ['Xizmatlarni yangilang', 'Narx va davomiylikni tekshiring; eski bron narxi o‘zgarmaydi.'],
      profile: ['Ommaviy profilni to‘ldiring', 'Haqiqiy manzil, portfolio va xizmat ma’lumotlarini kiriting.'],
      schedule: ['Ish vaqtini tekshiring', 'Tanaffus va maxsus kunlarni mavjud bronlar bilan solishtiring.'],
    },
  },
  ru: {
    label: 'Подсказки для страницы', open: 'Показать подсказку', hide: 'Свернуть', dismiss: 'Скрыть на эту сессию',
    action: 'Перейти в раздел', help: 'Подробнее в справке', important: 'Запись действительна только после подтверждения сервером.',
    customer: {
      home: ['Начните с поиска', 'Найдите барбера по услуге или адресу.'],
      explore: ['Выберите барбера', 'Проверьте цены, услуги и доступное время перед отправкой запроса.'],
      social: ['Найдите идеи', 'Смотрите публикации и сохраняйте понравившиеся. Сохранение не создаёт запись.'],
      bookings: ['Проверьте записи', 'Если результат неизвестен, не повторяйте действие до проверки статуса.'],
      queue: ['Следите за очередью', 'Время ожидания примерное. Подтвердите предложение QR отдельно.'],
      profile: ['Защитите профиль', 'Не сообщайте другим пароль и одноразовый код OTP.'],
    },
    barber: {
      home: ['Подготовьтесь к рабочему дню', 'Проверьте профиль, услуги и часы работы.'],
      bookings: ['Управляйте записями', 'Проверяйте статус, не обещайте неподтверждённое время.'],
      queue: ['Проверьте очередь', 'Отдельно отмечайте прибытие клиента и начало услуги.'],
      services: ['Обновите услуги', 'Проверьте цену и длительность. Цена старой записи не меняется.'],
      profile: ['Заполните профиль', 'Укажите реальные адрес, работы и услуги.'],
      schedule: ['Проверьте график', 'Сверьте перерывы и особые дни с записями.'],
    },
  },
  en: {
    label: 'Page guidance', open: 'Show guidance', hide: 'Collapse', dismiss: 'Hide for this session',
    action: 'Open section', help: 'Read help', important: 'Bookings are final only after the server confirms them.',
    customer: {
      home: ['Start with search', 'Find a barber by service or location.'],
      explore: ['Choose a barber', 'Check prices, services and available times before booking.'],
      social: ['Explore inspiration', 'Browse and save posts. Saving does not create a booking.'],
      bookings: ['Review your bookings', 'If an action is uncertain, check its status before trying again.'],
      queue: ['Follow your queue', 'Wait time is an estimate. Confirm QR offers separately.'],
      profile: ['Protect your profile', 'Never share your password or one-time OTP code.'],
    },
    barber: {
      home: ['Prepare for the day', 'Check your public profile, services and schedule.'],
      bookings: ['Manage bookings', 'Check the server status before promising an appointment.'],
      queue: ['Check the queue', 'Record arrival and service start as separate actions.'],
      services: ['Update your services', 'Check price and duration. Existing booking snapshots do not change.'],
      profile: ['Complete your profile', 'Enter accurate address, portfolio and services.'],
      schedule: ['Review working hours', 'Check breaks and special days against existing bookings.'],
    },
  },
};

export function guideSectionV166(role, pathname) {
  if (!Object.hasOwn(GUIDE_ROUTES_V166, role) || typeof pathname !== 'string') return null;
  const root = `/${role === 'customer' ? 'user' : 'barber'}`;
  if (pathname === root || pathname === `${root}/`) return 'home';
  const part = pathname.startsWith(`${root}/`) ? pathname.slice(root.length + 1).split('/')[0] : '';
  if (part === 'barbers') return 'explore';
  return Object.hasOwn(GUIDE_ROUTES_V166[role], part) ? part : null;
}
export function guideTextV166(role, pathname, lang) {
  const section = guideSectionV166(role, pathname);
  const data = translations[lang] || translations.uz;
  if (!section) return null;
  const content = data[role][section];
  const route = GUIDE_ROUTES_V166[role][section];
  return { ...data, title: content[0], description: content[1], path: route.path, topicPath: `/help?topic=${route.topic}`, section };
}
export function guideAccountKeyV166(role, accountId) {
  if (!['customer', 'barber'].includes(role) || !Number.isSafeInteger(accountId) || accountId <= 0) return null;
  return `ustara:guide:v166:${role}:${accountId}`;
}
