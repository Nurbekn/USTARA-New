// v159: UI-only translations, never a substitute for server-side authorization.
const translations=Object.freeze({
 uz:Object.freeze({title:'Smart Booking markaziy boshqaruvi',description:'Bu sozlama faqat YANGI bo‘sh vaqt takliflarini to‘xtatadi. Allaqachon yuborilgan takliflar, bronlar va navbat o‘z holicha qoladi.',active:'Faol',paused:'Pauzada',pause:'Yangi takliflarni to‘xtatish',resume:'Yangi takliflarni yoqish',confirmPause:'Yangi Smart Booking takliflari vaqtincha to‘xtatilsinmi?',confirmResume:'Smart Booking takliflari qayta yoqilsinmi?',unknown:'Holat tasdiqlanmagan. Yangilang.',revision:'Sozlama versiyasi'}),
 ru:Object.freeze({title:'Центральное управление Smart Booking',description:'Эта настройка останавливает только НОВЫЕ предложения. Отправленные предложения, записи и очередь остаются без изменений.',active:'Включён',paused:'Приостановлен',pause:'Приостановить новые предложения',resume:'Возобновить новые предложения',confirmPause:'Приостановить новые предложения Smart Booking?',confirmResume:'Возобновить предложения Smart Booking?',unknown:'Состояние не подтверждено. Обновите страницу.',revision:'Версия настройки'}),
 en:Object.freeze({title:'Smart Booking central controls',description:'This setting pauses NEW invitations only. Existing offers, bookings and the queue are unchanged.',active:'Enabled',paused:'Paused',pause:'Pause new invitations',resume:'Resume new invitations',confirmPause:'Pause new Smart Booking invitations?',confirmResume:'Resume Smart Booking invitations?',unknown:'Update not confirmed. Refresh before retrying.',revision:'Settings revision'}),
});
export const getSmartBookingAdminLocale=lang=>translations[lang]||translations.uz;
export const isValidSmartBookingAdminState=obj=>Boolean(obj&&typeof obj.enabled==='boolean'&&
  (typeof obj.revision==='number'&&Number.isSafeInteger(obj.revision)&&obj.revision>=1 ||
   typeof obj.revision==='string'&&/^[1-9]\d*$/.test(obj.revision)&&
     Number.isSafeInteger(Number(obj.revision))));
