// v140 — #76 Admin operational UI translations only.
// UI locale never changes HTTP endpoints, body fields, permissions or status identifiers.
const words = {
  uz: {
    headers: {
      users:['Foydalanuvchi','Telefon','Rol','Ro‘yxatdan o‘tgan','Amal'],
      barbers:['Sartarosh','Telefon','Yo‘nalish','Holat','Amallar'],
      bookings:['Bron','Mijoz','Sartarosh','Xizmat','Vaqt','Holat'],
      recovery:['So‘rov','Telefon','Holat','Yuborilgan','Amallar'],
      reports:['Post','Sartarosh','Sabab','Izoh','Sana','Amal'],
      promotions:['Sartarosh','Holat','Amal qilish','Boshqarish'],
    },
    roles:{barber:'Sartarosh',customer:'Mijoz'},
    statuses:{pending:'Kutilmoqda',approved:'Tasdiqlangan',rejected:'Rad etilgan',confirmed:'Tasdiqlangan',completed:'Yakunlangan',cancelled:'Bekor qilingan',canceled:'Bekor qilingan',reviewing:'Ko‘rib chiqilmoqda',verification_needed:'Tasdiqlash zarur',closed:'Yopilgan',active:'Faol',inactive:'Faol emas'},
    actions:{delete:'O‘chirish',approve:'Tasdiqlash',reject:'Rad etish',review:'Ko‘rish',needsVerification:'Tasdiqlash talab',close:'Yopish',deletePost:'Postni o‘chirish',stop:'To‘xtatish',promote:'Reklama qilish',save:'Saqlash'},
    missingName:'Ism kiritilmagan',missingSalon:'Salon ko‘rsatilmagan',listHint:'So‘nggi 200 ta yozuv. Parollar ko‘rsatilmaydi. Hisob o‘chirilsa, unga bog‘liq ma’lumotlar ham yo‘qolishi mumkin.',
    verifyQuestion:(id,status)=>`Sartarosh #${id}: ${status==='approved'?'tasdiqlansinmi':'rad etilsinmi'}?`,
    deleteAccountQuestion:(name,phone)=>`${name} hisobini o‘chirish uchun telefon raqamini kiriting: ${phone}\nDiqqat: hisob va unga bog‘liq ma’lumotlar qaytarilmas tarzda o‘chiriladi.`,
    promoteQuestion:(id,hours,active)=>active?'Reklama to‘xtatilsinmi?':`Sartarosh #${id} ${hours} soat reklama qilinsinmi?`,
    reviewRecoveryQuestion:(id,status)=>`Tiklash so‘rovi ${id}: ${status}\nTekshiruv sababini yozing (parol yoki hujjat raqamini kiritmang).`,
    removePostQuestion:id=>`Post #${id} o‘chirilsinmi? Bu amalni qaytarib bo‘lmaydi.`,
    profileReviewQuestion:(id,status)=>`Profil xatosi #${id}: ${status==='resolved'?'ko‘rib chiqildi':'asossiz'} deb yopilsinmi?`,
    errors:{deleteAccount:'Hisobni o‘chirib bo‘lmadi.',promotions:'Reklamani yangilab bo‘lmadi.',qrRange:'QR muddati 1–120 daqiqa bo‘lishi kerak.',recovery:'Tiklash so‘rovi yangilanmadi.',profileUnknown:'Server natijani tasdiqlamadi. Qayta yuborishdan oldin ro‘yxatni yangilang.',profileUnconfirmed:'Xabar holati tasdiqlanmadi.',profileRefresh:'Qayta yuborishdan oldin yangi holatni tekshiring.'},
    promotion:{description:'Tasdiqlangan sartaroshni belgilangan muddat reklama qiling. To‘lovni sayt hisoblamaydi — admin tasdiqlaydi.',hours:'Muddat (soat)',active:'Reklamada'},
    qr:{title:'Walk-in QR amal qilish muddati',description:'Bu sozlamani faqat Admin o‘zgartiradi. Yangi QR kodlar uchun amal qiladi; avval yaratilgan kodning muddati o‘zgarmaydi.',duration:'QR muddati (daqiqa)',current:'Hozirgi qiymat',minute:'daqiqa'},
    telegram:{title:'Telegram bot diagnostikasi',mode:'Rejim',configured:'Sozlangan',api:'Telegram API aloqasi',identity:'Bot identifikatsiyasi',webhook:'Webhook',linked:'Bog‘langan sartaroshlar',yes:'Ha',no:'Yo‘q',reachable:'Bor',match:'Mos',mismatch:'Mos emas',present:'Mavjud',unknown:'Tekshirib bo‘lmadi',conflict:'Webhook yoqilgan, ammo worker polling rejimida. Rejimlarni moslashtiring.',hint:'API aloqasi bot ishlayotganini isbotlamaydi. Telegramda /start yuborib ham tekshiring.'},
  },
  ru: {
    headers:{users:['Пользователь','Телефон','Роль','Дата регистрации','Действие'],barbers:['Барбер','Телефон','Специализация','Статус','Действия'],bookings:['Запись','Клиент','Барбер','Услуга','Время','Статус'],recovery:['Запрос','Телефон','Статус','Отправлено','Действия'],reports:['Пост','Барбер','Причина','Комментарий','Дата','Действие'],promotions:['Барбер','Статус','Действует до','Управление']},
    roles:{barber:'Барбер',customer:'Клиент'},
    statuses:{pending:'Ожидает',approved:'Подтверждён',rejected:'Отклонён',confirmed:'Подтверждена',completed:'Завершена',cancelled:'Отменена',canceled:'Отменена',reviewing:'На рассмотрении',verification_needed:'Требуется проверка',closed:'Закрыт',active:'Активен',inactive:'Неактивен'},
    actions:{delete:'Удалить',approve:'Подтвердить',reject:'Отклонить',review:'Рассмотреть',needsVerification:'Нужна проверка',close:'Закрыть',deletePost:'Удалить пост',stop:'Остановить',promote:'Рекламировать',save:'Сохранить'},
    missingName:'Имя не указано',missingSalon:'Салон не указан',listHint:'Последние 200 записей. Пароли скрыты. При удалении учётной записи связанные данные могут быть потеряны.',
    verifyQuestion:(id,status)=>`Барбер #${id}: ${status==='approved'?'подтвердить':'отклонить'}?`,
    deleteAccountQuestion:(name,phone)=>`Введите телефон для удаления учётной записи ${name}: ${phone}\nВнимание: удаление записи и связанных данных необратимо.`,
    promoteQuestion:(id,hours,active)=>active?'Остановить рекламу?':`Рекламировать барбера #${id} в течение ${hours} ч.?`,
    reviewRecoveryQuestion:(id,status)=>`Запрос восстановления ${id}: ${status}\nУкажите причину (не вводите пароль или номер документа).`,
    removePostQuestion:id=>`Удалить пост #${id}? Это действие нельзя отменить.`,
    profileReviewQuestion:(id,status)=>`Закрыть ошибку профиля #${id} как ${status==='resolved'?'рассмотренную':'необоснованную'}?`,
    errors:{deleteAccount:'Не удалось удалить учётную запись.',promotions:'Не удалось обновить рекламу.',qrRange:'Срок QR должен составлять 1–120 минут.',recovery:'Не удалось обновить запрос восстановления.',profileUnknown:'Сервер не подтвердил результат. Перед повтором обновите список.',profileUnconfirmed:'Статус сообщения не подтверждён.',profileRefresh:'Перед повтором проверьте новый статус.'},
    promotion:{description:'Рекламируйте подтверждённого барбера на выбранный срок. Оплату утверждает администратор, сайт её не рассчитывает.',hours:'Продолжительность (часы)',active:'Рекламируется'},
    qr:{title:'Срок действия QR для очереди',description:'Эту настройку меняет только администратор. Она влияет на новые QR-коды, но не продлевает уже выданные.',duration:'Срок QR (минуты)',current:'Текущее значение',minute:'мин.'},
    telegram:{title:'Диагностика Telegram-бота',mode:'Режим',configured:'Настроен',api:'Подключение к Telegram API',identity:'Идентификация бота',webhook:'Webhook',linked:'Привязанные барберы',yes:'Да',no:'Нет',reachable:'Есть',match:'Совпадает',mismatch:'Не совпадает',present:'Есть',unknown:'Не удалось проверить',conflict:'Webhook активен, но worker использует polling. Согласуйте режимы.',hint:'Доступность API не доказывает, что бот работает. Проверьте ответ на /start в Telegram.'},
  },
  en: {
    headers:{users:['User','Phone','Role','Registered','Action'],barbers:['Barber','Phone','Specialty','Status','Actions'],bookings:['Booking','Customer','Barber','Service','Time','Status'],recovery:['Request','Phone','Status','Submitted','Actions'],reports:['Post','Barber','Reason','Details','Date','Action'],promotions:['Barber','Status','Expires','Manage']},
    roles:{barber:'Barber',customer:'Customer'},
    statuses:{pending:'Pending',approved:'Approved',rejected:'Rejected',confirmed:'Confirmed',completed:'Completed',cancelled:'Cancelled',canceled:'Cancelled',reviewing:'Under review',verification_needed:'Verification needed',closed:'Closed',active:'Active',inactive:'Inactive'},
    actions:{delete:'Delete',approve:'Approve',reject:'Reject',review:'Review',needsVerification:'Needs verification',close:'Close',deletePost:'Delete post',stop:'Stop',promote:'Promote',save:'Save'},
    missingName:'Name not provided',missingSalon:'Salon not provided',listHint:'Latest 200 records. Passwords are hidden. Deleting an account may also remove related data.',
    verifyQuestion:(id,status)=>`Barber #${id}: ${status==='approved'?'approve':'reject'}?`,
    deleteAccountQuestion:(name,phone)=>`Enter the phone to delete ${name}'s account: ${phone}\nWarning: deleting the account and related records is irreversible.`,
    promoteQuestion:(id,hours,active)=>active?'Stop this promotion?':`Promote barber #${id} for ${hours} hours?`,
    reviewRecoveryQuestion:(id,status)=>`Recovery request ${id}: ${status}\nEnter a review reason (do not enter passwords or document numbers).`,
    removePostQuestion:id=>`Delete post #${id}? This cannot be undone.`,
    profileReviewQuestion:(id,status)=>`Close profile issue #${id} as ${status==='resolved'?'reviewed':'dismissed'}?`,
    errors:{deleteAccount:'Could not delete the account.',promotions:'Could not update the promotion.',qrRange:'QR duration must be 1–120 minutes.',recovery:'Could not update recovery request.',profileUnknown:'Server did not confirm the result. Refresh before retrying.',profileUnconfirmed:'Report status was not confirmed.',profileRefresh:'Check the refreshed status before retrying.'},
    promotion:{description:'Promote an approved barber for a chosen period. The site does not calculate payment; admins confirm it.',hours:'Duration (hours)',active:'Promoted'},
    qr:{title:'Walk-in QR expiration',description:'Only admins can change this setting. It applies to new QR codes and does not extend existing ones.',duration:'QR duration (minutes)',current:'Current setting',minute:'minutes'},
    telegram:{title:'Telegram bot diagnostics',mode:'Mode',configured:'Configured',api:'Telegram API connection',identity:'Bot identity',webhook:'Webhook',linked:'Linked barbers',yes:'Yes',no:'No',reachable:'Reachable',match:'Match',mismatch:'Mismatch',present:'Active',unknown:'Unavailable',conflict:'Webhook is enabled, but worker uses polling. Align the modes.',hint:'API access does not prove the bot is processing messages. Test a /start response in Telegram.'},
  },
};
const allowed = new Set(['uz','ru','en']);
export function getAdminOperations(lang) {
  return words[allowed.has(lang) ? lang : 'uz'];
}
// Unknown server statuses remain visible as their unmodified identifiers, not guessed localized states.
export function adminStatusLabel(status, lang) {
  const statuses = getAdminOperations(lang).statuses;
  return typeof status === 'string' && Object.hasOwn(statuses,status) ? statuses[status] : String(status ?? '—');
}
export function adminRoleLabel(role,lang) {
  const roles=getAdminOperations(lang).roles;
  return typeof role==='string' && Object.hasOwn(roles,role) ? roles[role] : String(role ?? '—');
}
export function adminTableHeaders(section, lang) {
  const headers=getAdminOperations(lang).headers;
  return typeof section==='string' && Object.hasOwn(headers,section) ? [...headers[section]] : [];
}
