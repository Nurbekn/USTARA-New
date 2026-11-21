// v180: isolated public-report UI strings; the server still owns permissions and outcomes.
const STRINGS = Object.freeze({
 uz: {
  title:'Profil xatosi', open:'Profildagi xatoni bildirish', close:'Xabar formasini yopish',
  hint:'Faqat aniq xato haqida yozing. Telefon, parol yoki shaxsiy hujjat ma’lumotini yubormang.',
  reason:'Xato turi', details:'Xatoni tushuntiring (10–500 belgi)',
  pendingLoading:'Avvalgi xabarlaringiz tekshirilmoqda…',
  pendingError:'Xabar holatini tekshirib bo‘lmadi. Tekshiruvsiz qayta yuborilmaydi.',
  pendingDuplicate:'Bu turdagi xabaringiz allaqachon tekshirilmoqda.', retry:'Holatni qayta tekshirish',
  sending:'Yuborilmoqda…', submit:'Adminga yuborish',
  loginRequired:'Xatoni bildirish uchun mijoz sifatida tizimga kiring.', login:'Kirish',
  noSession:'Xabar yuborish uchun tizimga kiring.',
  badResponse:'Server tasdiq bermadi.',
  sent:'Xabaringiz admin tekshiruviga yuborildi. Profil avtomatik o‘zgartirilmadi.',
  duplicate:'Bu turdagi xabar avval yuborilgan va tekshirilmoqda.',
  expired:'Sessiya tugagan. Qayta tizimga kiring.', invalid:'Xato izohini tekshirib qayta yuboring.',
  unknown:'Xabar yuborilganini tasdiqlab bo‘lmadi. Qayta yuborishdan avval holatini tekshiring.',
  reasons:{address:'Manzil yoki xarita',hours:'Ish vaqti',services:'Xizmat yoki narx',media:'Profil rasmi yoki ma’lumot',other:'Boshqa xato'}
 },
 ru: {
  title:'Ошибка в профиле',open:'Сообщить об ошибке в профиле',close:'Закрыть форму',
  hint:'Опишите только фактическую ошибку. Не отправляйте телефон, пароль или данные документов.',
  reason:'Тип ошибки',details:'Описание ошибки (10–500 символов)',
  pendingLoading:'Проверяем предыдущие сообщения…',pendingError:'Статус не удалось проверить. Повторная отправка заблокирована.',
  pendingDuplicate:'Такое сообщение уже находится на проверке.',retry:'Проверить статус снова',
  sending:'Отправка…',submit:'Отправить администратору',
  loginRequired:'Для сообщения об ошибке войдите в аккаунт клиента.',login:'Войти',
  noSession:'Войдите в аккаунт, чтобы отправить сообщение.',badResponse:'Нет подтверждения сервера.',
  sent:'Сообщение отправлено на проверку. Профиль не изменён автоматически.',
  duplicate:'Сообщение этого типа уже проверяется.',expired:'Сессия истекла. Войдите снова.',
  invalid:'Проверьте текст и повторите.',unknown:'Не удалось подтвердить отправку. Сначала проверьте статус.',
  reasons:{address:'Адрес или карта',hours:'Рабочие часы',services:'Услуга или цена',media:'Фото или сведения',other:'Другая ошибка'}
 },
 en: {
  title:'Profile issue',open:'Report an issue with this profile',close:'Close report form',
  hint:'Report only a factual error. Do not include phone numbers, passwords or document details.',
  reason:'Issue type',details:'Describe the issue (10–500 characters)',
  pendingLoading:'Checking earlier reports…',pendingError:'Unable to verify report status. Resending is blocked.',
  pendingDuplicate:'A report in this category is already under review.',retry:'Check status again',
  sending:'Sending…',submit:'Send to admin',
  loginRequired:'Sign in as a customer to report an issue.',login:'Sign in',
  noSession:'Sign in to send a report.',badResponse:'The server did not confirm receipt.',
  sent:'Your report has been submitted for admin review. The profile has not changed automatically.',
  duplicate:'A report in this category is already under review.',expired:'Session expired. Sign in again.',
  invalid:'Check the report text and try again.',unknown:'Receipt could not be confirmed. Check the status before retrying.',
  reasons:{address:'Address or map',hours:'Working hours',services:'Service or price',media:'Photo or profile info',other:'Other issue'}
 }
});
export function profileIssueUiV180(lang='uz') { return STRINGS[Object.hasOwn(STRINGS,lang) ? lang : 'uz']; }
