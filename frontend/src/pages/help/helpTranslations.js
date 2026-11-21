// v138 — #76: curated public-help translations only.
// These are static interface strings. No admin panel, credentials or remote translation API.
export const HELP_LANGUAGES = Object.freeze([
  { id: 'uz', label: "O‘zbekcha" },
  { id: 'ru', label: 'Русский' },
  { id: 'en', label: 'English' },
]);

export const HELP_TRANSLATIONS = Object.freeze({
  uz: {
    categories: { all: 'Barchasi', customer: 'Mijozlar', barber: 'Sartaroshlar', privacy: 'Xavfsizlik' },
    ui: {
      language: 'Til', eyebrow: 'USTARA • yordam markazi', title: 'Qanday yordam kerak?',
      introText: 'Bron qilish, qidiruv, navbat va profil bo‘yicha qisqa ko‘rsatmalar. Bu bo‘lim hech qanday shaxsiy ma’lumotingizni yubormaydi.',
      introRegion: 'Ixtiyoriy boshlang‘ich ko‘rsatma', introOpen: '3 qadamda boshlash (ixtiyoriy)', introClose: 'Qisqa yo‘riqnomani yopish',
      introSteps: [
        { before: '', link: 'Sartaroshni toping', after: ' va xizmatlarini ko‘ring.' },
        { text: 'Server tekshirgan bo‘sh kun va vaqtni tanlang.' },
        { before: 'Bron tasdig‘ini akkauntingizdagi ', link: 'Bronlar', after: ' bo‘limidan tekshiring.' },
      ],
      searchLabel: 'Yordamdan qidirish', searchPlaceholder: 'Masalan: bron, QR, xavfsizlik', clear: 'Qidiruvni tozalash',
      categoryNav: 'Yordam toifalari', back: 'Barcha savollarga qaytish', results: 'Yordam savollari', countSuffix: 'ta mavzu',
      emptyTitle: 'Mos yo‘riqnoma topilmadi.', emptyBody: 'Boshqa kalit so‘z bilan qidiring yoki barcha savollarga qayting.', allQuestions: 'Barcha savollar',
      authNote: ' (kirish talab qilinadi)', footer: 'Yordam sahifasi bronni yoki shikoyatni avtomatik yubormaydi. Muammo hal bo‘lmasa, tegishli profil yoki bron sahifasidagi ko‘rsatmalarga amal qiling.',
    },
  },
  ru: {
    categories: { all: 'Все', customer: 'Клиентам', barber: 'Барберам', privacy: 'Безопасность' },
    ui: {
      language: 'Язык', eyebrow: 'USTARA • центр помощи', title: 'Чем вам помочь?',
      introText: 'Краткие инструкции по записи, поиску, очереди и профилю. Эта страница не отправляет ваши личные данные.',
      introRegion: 'Необязательное руководство для начала работы', introOpen: 'Начать за 3 шага (необязательно)', introClose: 'Скрыть руководство',
      introSteps: [
        { before: '', link: 'Найдите барбера', after: ' и изучите услуги.' },
        { text: 'Выберите день и свободное время, подтверждённые сервером.' },
        { before: 'Проверьте запись в разделе ', link: 'Мои записи', after: ' вашего аккаунта.' },
      ],
      searchLabel: 'Поиск по справке', searchPlaceholder: 'Например: запись, QR, безопасность', clear: 'Очистить поиск',
      categoryNav: 'Разделы справки', back: 'Ко всем вопросам', results: 'Вопросы и ответы', countSuffix: 'тем',
      emptyTitle: 'Подходящих инструкций нет.', emptyBody: 'Попробуйте другие слова или вернитесь ко всем вопросам.', allQuestions: 'Все вопросы',
      authNote: ' (требуется вход)', footer: 'Эта страница не создаёт записи и не отправляет жалобы. Если проблема осталась, следуйте инструкциям на странице профиля или записи.',
    },
    topics: {
      search: {
        title: 'Как найти барбера?',
        answer: 'В каталоге ищите по имени, услуге или адресу, указанному барбером. Уточняйте результаты по услуге и цене. Для сортировки по расстоянию необходимо указать местоположение в своём профиле.',
        keywords: 'поиск район карта адрес барбер цена фильтр', links: ['Каталог барберов'],
      },
      booking: {
        title: 'Как записаться?',
        answer: 'Откройте подтверждённый публичный профиль барбера, выберите услугу, день и свободное время, проверенное сервером. Запись считается оформленной только после подтверждения сервера. Может потребоваться вход в аккаунт.',
        keywords: 'запись бронирование услуга время день', links: ['Выбрать барбера'],
      },
      bookings: {
        title: 'Как посмотреть или отменить запись?',
        answer: 'В разделе «Мои записи» вы можете посмотреть будущие посещения и историю. Отмена доступна только в пределах указанных сроков и правил. Если результат операции неизвестен, проверьте статус, прежде чем повторять действие.',
        keywords: 'мои записи отмена перенос история', links: ['Мои записи'],
      },
      queue: {
        title: 'Как работает живая очередь и QR?',
        answer: 'Если доступна QR-очередь или очередь без записи, следите за статусом на соответствующей странице. Вступление в очередь и предложение услуги могут требовать отдельного подтверждения. Ожидаемое время не гарантирует точное время начала.',
        keywords: 'qr очередь ожидание без записи', links: ['Моя очередь'],
      },
      profile: {
        title: 'Что делать, если в профиле ошибка?',
        answer: 'В публичном профиле барбера откройте раздел сообщения об ошибке и укажите неверные данные. Статус рассмотрения сообщения можно проверить в том же профиле.',
        keywords: 'жалоба ошибка профиль расписание адрес услуга', links: ['Найти профиль'],
      },
      'barber-profile': {
        title: 'Как подготовить профиль барбера?',
        answer: 'В кабинете барбера заполните разделы «Профиль», «Услуги» и «Рабочее время». Просмотр профиля глазами клиента доступен только для подтверждённых активных профилей.',
        keywords: 'барбер портфолио услуги рабочее время профиль', links: ['Профиль барбера'],
      },
      'barber-bookings': {
        title: 'Где барбер управляет записями и очередью?',
        answer: 'В кабинете барбера записи и очередь управляются отдельно. Если сервер не подтвердил результат действия, обновите статус и проверьте его. Не отправляйте одну операцию повторно вслепую.',
        keywords: 'барбер записи очередь qr отмена', links: ['Записи барбера'],
      },
      privacy: {
        title: 'Как защищаются личные данные и ссылки?',
        answer: 'Публичная ссылка на профиль не содержит сведения о личной записи или токен входа. Для просмотра личных записей войдите в свой аккаунт. Никому не сообщайте пароль, одноразовый OTP-код или токен входа.',
        keywords: 'телефон безопасность сессия приватность otp токен ссылка', links: ['Войти в аккаунт'],
      },
    },
  },
  en: {
    categories: { all: 'All', customer: 'Customers', barber: 'Barbers', privacy: 'Security' },
    ui: {
      language: 'Language', eyebrow: 'USTARA • help center', title: 'How can we help?',
      introText: 'Short guidance on booking, search, queues and profiles. This page does not send your personal information.',
      introRegion: 'Optional getting-started guide', introOpen: 'Get started in 3 steps (optional)', introClose: 'Hide the short guide',
      introSteps: [
        { before: '', link: 'Find a barber', after: ' and explore their services.' },
        { text: 'Choose an available date and time verified by the server.' },
        { before: 'Check the booking confirmation in ', link: 'My bookings', after: ' in your account.' },
      ],
      searchLabel: 'Search help', searchPlaceholder: 'For example: booking, QR, security', clear: 'Clear search',
      categoryNav: 'Help categories', back: 'Back to all questions', results: 'Help questions', countSuffix: 'topics',
      emptyTitle: 'No matching guidance found.', emptyBody: 'Try other keywords or return to all questions.', allQuestions: 'All questions',
      authNote: ' (sign-in required)', footer: 'This help page does not automatically submit bookings or reports. If an issue remains unresolved, follow the instructions on the relevant profile or booking page.',
    },
    topics: {
      search: {
        title: 'How do I find a barber?',
        answer: 'In the directory, search by name, service, or the address provided by the barber. Narrow the results by service and price. To sort by distance, your profile must have a location.',
        keywords: 'search district map address barber price filter', links: ['Barber directory'],
      },
      booking: {
        title: 'How do I book an appointment?',
        answer: 'Open a verified public barber profile, choose a service, date and available time confirmed by the server. The booking is final only when the server confirms it. You may need to sign in.',
        keywords: 'booking appointment service time date', links: ['Find a barber'],
      },
      bookings: {
        title: 'How do I view or cancel a booking?',
        answer: 'Open My bookings in your account to see upcoming visits and booking history. Cancellation is possible only within the displayed deadlines and rules. If the result is uncertain, check the booking status before trying again.',
        keywords: 'my bookings cancel reschedule history', links: ['My bookings'],
      },
      queue: {
        title: 'How do walk-in queues and QR codes work?',
        answer: 'If a QR or walk-in queue is available, follow its status on the relevant queue page. Joining and accepting a service offer may require separate confirmation. An estimated wait is not a guaranteed start time.',
        keywords: 'qr walk in queue waiting', links: ['My queue'],
      },
      profile: {
        title: 'What if a barber profile contains an error?',
        answer: 'Open the error-reporting section of the public barber profile and report the incorrect information. You can check the report status on the same profile.',
        keywords: 'report mistake profile hours address service', links: ['Find a profile'],
      },
      'barber-profile': {
        title: 'How do I set up a barber profile?',
        answer: 'In the barber dashboard, complete your Profile, Services and Working hours. Previewing the profile as a customer is available only for approved, active profiles.',
        keywords: 'barber portfolio service work hours profile approval', links: ['Barber profile'],
      },
      'barber-bookings': {
        title: 'Where does a barber manage bookings and queues?',
        answer: 'Bookings and the queue have separate sections in the barber dashboard. If the server has not clearly confirmed an action, refresh and check its status. Do not blindly repeat the same action.',
        keywords: 'barber bookings queue qr cancel', links: ['Barber bookings'],
      },
      privacy: {
        title: 'What about my personal data and shared links?',
        answer: 'Sharing a public profile link does not share booking details or sign-in tokens. Sign in to view your private bookings. Never share your password, one-time OTP code, or authentication token with anyone.',
        keywords: 'phone security session privacy otp token link sharing', links: ['Sign in'],
      },
    },
  },
});
