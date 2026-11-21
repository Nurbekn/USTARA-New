// v188: an operator's review queue, not a notification delivery system.
export const CASE_FILTERS_V188=['open','pending','reviewed','attempted','closed'];
export const CASE_CHANNELS_V188=['phone','telegram','other'];
export function suspensionCasesUrlV188(status='open',page=1){
  if(!CASE_FILTERS_V188.includes(status)||!Number.isInteger(page)||page<1||page>100)return null;
  return `/api/admin/suspension-cases?status=${status}&page=${page}`;
}
export function suspensionCaseActionUrlV188(id){
  if(!/^[1-9]\d{0,17}$/.test(String(id)))return null;
  return `/api/admin/suspension-cases/${id}`;
}
export function validCasePageV188(value,status,page){
  return value?.status===status&&value?.page===page&&value?.readOnlyListing===true&&
    value.notificationsSent===false&&typeof value.hasMore==='boolean'&&Array.isArray(value.rows)&&
    value.rows.length<=50&&value.rows.every(x=>suspensionCaseActionUrlV188(x.id)!==null&&
      ['pending','reviewed','attempted','closed'].includes(x.case_status)&&
      Number.isSafeInteger(x.revision)&&x.revision>=0);
}
export function validCaseMutationV188(value,id,action,revision){
  const expected=action==='review'?'reviewed':action==='attempt'?'attempted':'closed';
  return value?.id!=null&&String(value.id)===String(id)&&value.status===expected&&
    value.revision===revision+1&&value.bookingsChanged===false&&value.notificationsSent===false;
}
export const suspensionCasesLocaleV188={
 uz:{intro:'Suspend qilingan akkauntlarning bronlari — operator ko‘rib chiqishi uchun. SMS yoki Telegram xabari avtomatik yuborilmaydi.',status:'Holat',page:'Sahifa',prev:'Oldingi',next:'Keyingi',none:'Ushbu sahifada ish yo‘q.',book:'Bron',contact:'Bog‘laniladigan tomon',customer:'Mijoz',barber:'Sartarosh',when:'Bron vaqti',bookingStatus:'Bron holati',caseStatus:'Ish holati',action:'Amal',review:'Ko‘rib chiqildi',attempt:'Bog‘lanishga urinish',close:'Yopish',refresh:'Yangilash',pending:'Tekshirilmagan',reviewed:'Ko‘rib chiqilgan',attempted:'Urinish qayd etilgan',closed:'Yopilgan',open:'Ochiq ishlar',phone:'Telefon',telegram:'Telegram',other:'Boshqa',channel:'Aloqa kanali',unknown:'Server holati noma’lum. Qayta yuborishdan oldin ishlar ro‘yxatini yangilang.',confirm:'Tanlangan amal auditga yoziladi. Bu xabar yetkazilganini anglatmaydi. Davom etilsinmi?',note:'Urinish qaydi xabar yetkazildi yoki o‘qildi degani emas. Bronni faqat alohida, mijoz roziligi asosidagi jarayon bilan o‘zgartirish mumkin.',unauthorized:'Admin ruxsati talab qilinadi.',loading:'Yuklanmoqda…'},
 ru:{intro:'Записи приостановленных аккаунтов для проверки оператором. SMS и сообщения Telegram автоматически не отправляются.',status:'Статус',page:'Страница',prev:'Назад',next:'Далее',none:'Нет задач.',book:'Запись',contact:'Кому звонить',customer:'Клиент',barber:'Барбер',when:'Время записи',bookingStatus:'Статус записи',caseStatus:'Статус задачи',action:'Действие',review:'Проверено',attempt:'Попытка связи',close:'Закрыть',refresh:'Обновить',pending:'Не проверено',reviewed:'Проверено',attempted:'Попытка записана',closed:'Закрыто',open:'Открытые задачи',phone:'Телефон',telegram:'Telegram',other:'Другое',channel:'Канал связи',unknown:'Состояние на сервере неизвестно. Обновите список перед повтором.',confirm:'Действие будет записано в аудит. Это не подтверждает доставку сообщения. Продолжить?',note:'Попытка связи не подтверждает доставку или прочтение. Изменяйте запись отдельно и только по правилам согласия.',unauthorized:'Требуется доступ администратора.',loading:'Загрузка…'},
 en:{intro:'Bookings affected by suspended accounts require operator review. No automatic SMS or Telegram message is sent.',status:'Status',page:'Page',prev:'Previous',next:'Next',none:'No cases on this page.',book:'Booking',contact:'Contact party',customer:'Customer',barber:'Barber',when:'Booking time',bookingStatus:'Booking status',caseStatus:'Case status',action:'Action',review:'Mark reviewed',attempt:'Log contact attempt',close:'Close',refresh:'Refresh',pending:'Needs review',reviewed:'Reviewed',attempted:'Attempt logged',closed:'Closed',open:'Open cases',phone:'Phone',telegram:'Telegram',other:'Other',channel:'Contact channel',unknown:'Server outcome is unknown. Refresh cases before attempting again.',confirm:'This action will be audited. It does not prove message delivery. Continue?',note:'A contact attempt does not prove delivery or reading. Change bookings only through a separate consent-based workflow.',unauthorized:'Admin access required.',loading:'Loading…'}
};
