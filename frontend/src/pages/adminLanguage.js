// USTARA v139 — #76: presentation-only Admin translation.
// Never derive permissions, request endpoints, login credentials, or stored tokens from UI locale.
export const ADMIN_LANGUAGES = Object.freeze([
  Object.freeze({id:'uz', label:'O‘zbekcha'}),
  Object.freeze({id:'ru', label:'Русский'}),
  Object.freeze({id:'en', label:'English'}),
]);
const validLanguages = new Set(ADMIN_LANGUAGES.map(item=>item.id));
const dict = {
  uz: {
    language:'Til', sections:{overview:'Umumiy',users:'Foydalanuvchilar',barbers:'Sartaroshlar',bookings:'Bronlar','suspension-cases':'Suspend bronlar',reports:'Shikoyatlar','profile-reports':'Profil xatolari',recovery:'Tiklash',telegram:'Telegram',system:'Tizim nazorati','queue-settings':'QR va navbat','smart-settings':'Smart Booking',promotions:'Reklama',badges:'Badge tekshiruvlari'},
    loginTitle:'Administrator kirishi', loginIntro:'Saytni boshqarish uchun alohida admin hisobingizdan foydalaning.', login:'Login', password:'Parol', signingIn:'Tekshirilmoqda...', signIn:'Panelga kirish', retryPrefix:'Qayta urinishgacha', retrySuffix:'qoldi.', back:'Saytga qaytish', exit:'Chiqish', control:'USTARA / Boshqaruv', refresh:'↻ Yangilash', loading:'Yuklanmoqda…', listSearch:'Ro‘yxatdan qidirish…', empty:'Ma’lumot topilmadi.',
    overview:{customers:'Mijozlar',barbers:'Sartaroshlar',pendingBarbers:'Kutilayotgan sartaroshlar',approvedBarbers:'Tasdiqlangan sartaroshlar',pendingBookings:'Kutilayotgan bronlar',completedBookings:'Yakunlangan bronlar',posts:'Postlar',reports:'Shikoyatlar'},
    profile:{title:'Profil xatolari',description:'Yangi xabarlar birinchi. Tasdiqsiz profil avtomatik o‘zgartirilmaydi. Xabar yuborgan mijozning identifikatori bu ro‘yxatda yo‘q.',filter:'Holati bo‘yicha',page:'Sahifa',pageHelp:'Har sahifada eng ko‘pi 100 ta yozuv.',previous:'Oldingi',next:'Keyingi',empty:'Ushbu filtr va sahifada xabar yo‘q.',headers:['Profil','Xato','Tavsif','Holat','Amal'],reasons:{address:'Manzil',hours:'Ish vaqti',services:'Xizmat / narx',media:'Profil',other:'Boshqa'},status:{pending:'Tekshirilmoqda',resolved:'Ko‘rib chiqildi',dismissed:'Rad etildi',all:'Barchasi'},resolve:'Ko‘rib chiqildi',dismiss:'Asossiz'},
  },
  ru: {
    language:'Язык', sections:{overview:'Обзор',users:'Пользователи',barbers:'Барберы',bookings:'Записи','suspension-cases':'Записи при блокировке',reports:'Жалобы','profile-reports':'Ошибки профиля',recovery:'Восстановление',telegram:'Telegram',system:'Контроль системы','queue-settings':'QR и очередь','smart-settings':'Smart Booking',promotions:'Реклама',badges:'Значки и проверки'},
    loginTitle:'Вход администратора',loginIntro:'Войдите под отдельной учётной записью администратора для управления сайтом.',login:'Логин',password:'Пароль',signingIn:'Проверка…',signIn:'Войти в панель',retryPrefix:'Повторная попытка через',retrySuffix:'.',back:'На сайт',exit:'Выйти',control:'USTARA / Управление',refresh:'↻ Обновить',loading:'Загрузка…',listSearch:'Поиск по списку…',empty:'Данные не найдены.',
    overview:{customers:'Клиенты',barbers:'Барберы',pendingBarbers:'Ожидают проверки',approvedBarbers:'Подтверждённые барберы',pendingBookings:'Ожидающие записи',completedBookings:'Завершённые записи',posts:'Публикации',reports:'Жалобы'},
    profile:{title:'Ошибки профиля',description:'Сначала новые сообщения. Профиль не изменяется автоматически без проверки. Личность отправителя не отображается в этом списке.',filter:'Статус',page:'Страница',pageHelp:'До 100 записей на страницу.',previous:'Назад',next:'Далее',empty:'Для выбранного фильтра нет сообщений.',headers:['Профиль','Ошибка','Описание','Статус','Действие'],reasons:{address:'Адрес',hours:'Часы работы',services:'Услуга / цена',media:'Профиль',other:'Другое'},status:{pending:'На проверке',resolved:'Рассмотрено',dismissed:'Отклонено',all:'Все'},resolve:'Рассмотрено',dismiss:'Необоснованно'},
  },
  en: {
    language:'Language',sections:{overview:'Overview',users:'Users',barbers:'Barbers',bookings:'Bookings','suspension-cases':'Suspended bookings',reports:'Reports','profile-reports':'Profile issues',recovery:'Recovery',telegram:'Telegram',system:'System Control','queue-settings':'QR and queue','smart-settings':'Smart Booking',promotions:'Promotions',badges:'Evidence badges'},
    loginTitle:'Administrator sign-in',loginIntro:'Use your separate administrator account to manage the site.',login:'Username',password:'Password',signingIn:'Checking…',signIn:'Sign in',retryPrefix:'Try again in',retrySuffix:'remaining.',back:'Back to site',exit:'Sign out',control:'USTARA / Administration',refresh:'↻ Refresh',loading:'Loading…',listSearch:'Search records…',empty:'No results found.',
    overview:{customers:'Customers',barbers:'Barbers',pendingBarbers:'Pending barbers',approvedBarbers:'Approved barbers',pendingBookings:'Pending bookings',completedBookings:'Completed bookings',posts:'Posts',reports:'Reports'},
    profile:{title:'Profile issues',description:'Newest reports first. Profiles are not changed automatically without verification. Reporter identity is not included in this list.',filter:'Status',page:'Page',pageHelp:'Up to 100 reports per page.',previous:'Previous',next:'Next',empty:'No reports match this page and filter.',headers:['Profile','Issue','Description','Status','Action'],reasons:{address:'Address',hours:'Opening hours',services:'Service / price',media:'Profile',other:'Other'},status:{pending:'Pending',resolved:'Resolved',dismissed:'Dismissed',all:'All'},resolve:'Mark reviewed',dismiss:'Dismiss'},
  },
};
export function readAdminLocale(value) {
  const params = value instanceof URLSearchParams ? value : new URLSearchParams(value || '');
  const entries=params.getAll('lang');
  return entries.length===1 && validLanguages.has(entries[0]) ? entries[0] : 'uz';
}
export function getAdminUi(lang='uz') {
  return dict[validLanguages.has(lang) ? lang : 'uz'];
}
export function adminLocaleParams(lang) {
  const next=new URLSearchParams();
  if(lang==='ru' || lang==='en') next.set('lang',lang);
  return next;
}
