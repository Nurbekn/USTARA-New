// v189: explicit Admin request only; Telegram acceptance is not delivery/read confirmation.
export const NOTICE_STATES_V189=['queued','sending','accepted','uncertain','cancelled'];
export function noticeRequestUrlV189(caseId){
 return /^[1-9]\d{0,17}$/.test(String(caseId)) ? `/api/admin/suspension-cases/${caseId}/telegram-notice`:null;
}
export function noticeRequestOkV189(value,caseId){
 return String(value?.caseId)===String(caseId)&&value?.noticeStatus==='queued'&&
  value?.notificationsSent===false&&value?.bookingsChanged===false;
}
export function canRequestTelegramV189(record){
 return record?.contact_role==='barber'&&record.telegram_contact_available===true&&record.account_still_suspended===true&&
   ['reviewed','attempted'].includes(record.case_status)&&
   ['pending','confirmed'].includes(record.booking_status)&&!record.telegram_notice_status;
}
export const noticeLocaleV189={
 uz:{title:'Telegram xabari',request:'Telegramga yuborishni so‘rash',queued:'Navbatda',sending:'Yuborish tekshirilmoqda',accepted:'Telegram API qabul qildi',uncertain:'Natija noma’lum',cancelled:'Bekor qilingan',unavailable:'Telegrami ulanmagan mijozga xabar yuborilmaydi',confirm:'Faqat Telegramini ulagan sartaroshga bir martalik xabar yuborish so‘rovi yaratilsinmi? Bu yetkazish yoki o‘qish tasdig‘i emas.',note:'“API qabul qildi” xabar qurilmaga yetdi yoki o‘qildi degani emas. Noma’lum holat avtomatik takrorlanmaydi.'},
 ru:{title:'Сообщение Telegram',request:'Запросить отправку Telegram',queued:'В очереди',sending:'В процессе',accepted:'Принято API Telegram',uncertain:'Результат неизвестен',cancelled:'Отменено',unavailable:'Отправка клиенту без привязанного Telegram недоступна',confirm:'Создать однократный запрос для привязанного Telegram барбера? Это не подтверждает доставку или прочтение.',note:'Ответ Telegram API не подтверждает получение или прочтение. Неопределённый результат автоматически не повторяется.'},
 en:{title:'Telegram notice',request:'Request Telegram notice',queued:'Queued',sending:'Sending',accepted:'Accepted by Telegram API',uncertain:'Outcome unknown',cancelled:'Cancelled',unavailable:'Customer Telegram delivery is unavailable without a verified link',confirm:'Queue a one-time Telegram notice for the linked barber? This is not a delivery or read receipt.',note:'Telegram API acceptance is not proof of device delivery or reading. Unknown outcomes are never auto-retried.'}
};
