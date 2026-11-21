export const EVENT_LABELS = {
  uz: {pending:'So‘rov',confirmed:'Tasdiqlandi',cancelled:'Bekor qilindi',rejected:'Rad etildi',rescheduled:'O‘zgartirildi'},
  ru: {pending:'Запрос',confirmed:'Подтверждена',cancelled:'Отменена',rejected:'Отклонена',rescheduled:'Изменена'},
  en: {pending:'Requested',confirmed:'Confirmed',cancelled:'Cancelled',rejected:'Rejected',rescheduled:'Modified'}
};
export const DELIVERY_LABELS = {
  uz: {queued:'Navbatda',sending:'Telegramga yuborilmoqda',accepted:'Telegram API qabul qildi (o‘qilgani noma’lum)',uncertain:'Yuborish holati noma’lum',cancelled:'Yuborish bekor qilingan'},
  ru: {queued:'В очереди',sending:'Отправляется в Telegram',accepted:'Принято API Telegram (не подтверждено прочтение)',uncertain:'Статус отправки неизвестен',cancelled:'Отправка отменена'},
  en: {queued:'Queued',sending:'Sending to Telegram',accepted:'Telegram API accepted (not a read receipt)',uncertain:'Send outcome unknown',cancelled:'Sending cancelled'}
};
const events=new Set(Object.keys(EVENT_LABELS.uz));
const states=new Set(Object.keys(DELIVERY_LABELS.uz));
export function safeNotificationHistory(value){
 if(!Array.isArray(value?.notices)||value.notices.length>20)return null;
 const normalized=[];
 for(const row of value.notices){
  if(!row||typeof row.id!=='string'||!/^\d{1,18}$/.test(row.id)||
     !Number.isSafeInteger(row.bookingId)||row.bookingId<=0||
     !events.has(row.event)||!states.has(row.status)||
     !Number.isFinite(Date.parse(row.createdAt)))return null;
  normalized.push({id:row.id,bookingId:row.bookingId,event:row.event,status:row.status,createdAt:row.createdAt});
 }
 return normalized;
}
