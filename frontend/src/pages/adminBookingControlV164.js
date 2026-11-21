// v164 booking controls: request options are allowlisted and URL encoded.
export const STATUSES_V164=Object.freeze(['all','pending','confirmed','completed','cancelled','rejected']);
export function validBookingDayV164(value){
 if(value==='')return true;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(`${value}T00:00:00Z`);
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function bookingControlEndpointV164({status='all',date='',barberId='',page=1}={}){
 if(!STATUSES_V164.includes(status)||!validBookingDayV164(date)||
    (barberId!==''&&(!/^[1-9]\d{0,9}$/.test(String(barberId))||Number(barberId)>2147483647))||
    !Number.isSafeInteger(page)||page<1||page>100)return null;
 const q=new URLSearchParams({status,page:String(page)});
 if(date)q.set('date',date);
 if(barberId!=='')q.set('barberId',String(barberId));
 return `/api/admin/bookings/control?${q.toString()}`;
}
export function validBookingControlResponseV164(value,page){
 return !!value&&value.page===page&&value.pageSize===50&&typeof value.hasNext==='boolean'&&
  Array.isArray(value.bookings)&&value.bookings.length<=50&&value.bookings.every(x=>
   x&&Number.isSafeInteger(Number(x.id))&&Number(x.id)>0&&typeof x.status==='string');
}
export const bookingLocaleV164=Object.freeze({
 uz:{intro:'Bronlar xavfsiz, faqat o‘qish rejimida ko‘rsatiladi. Bu yerda hech kimning bronini o‘zgartirmaysiz.',status:'Holati',all:'Barchasi',day:'Bron sanasi (Toshkent)',barber:'Sartarosh ID (ixtiyoriy)',apply:'Filtrlash',prev:'Oldingi',next:'Keyingi',page:'Sahifa',none:'Bu filtr uchun bron topilmadi.',hint:'Har sahifada 50 tagacha bron. To‘liq statistik ma’lumot emas; 100 sahifadan oshmaydi.',invalid:'Filtr noto‘g‘ri. Sana va sartarosh ID ni tekshiring.',response:'Server bron ro‘yxatini tasdiqlamadi.',barberId:'Sartarosh ID',statusNames:{pending:'Kutilmoqda',confirmed:'Tasdiqlangan',completed:'Yakunlangan',cancelled:'Bekor qilingan',rejected:'Rad etilgan'}},
 ru:{intro:'Безопасный просмотр записей. Изменение записей недоступно.',status:'Статус',all:'Все',day:'Дата записи (Ташкент)',barber:'ID барбера (необязательно)',apply:'Фильтровать',prev:'Назад',next:'Далее',page:'Страница',none:'Нет записей для фильтра.',hint:'До 50 записей на странице, не полный отчёт. Максимум 100 страниц.',invalid:'Неверный фильтр. Проверьте дату и ID барбера.',response:'Ответ сервера не прошёл проверку.',barberId:'ID барбера',statusNames:{pending:'Ожидает',confirmed:'Подтверждена',completed:'Завершена',cancelled:'Отменена',rejected:'Отклонена'}},
 en:{intro:'Read-only booking review. This view cannot change any appointment.',status:'Status',all:'All',day:'Appointment day (Tashkent)',barber:'Barber ID (optional)',apply:'Apply filters',prev:'Previous',next:'Next',page:'Page',none:'No bookings match these filters.',hint:'At most 50 bookings per page, not a complete report. Maximum 100 pages.',invalid:'Invalid filters. Check the date and barber ID.',response:'Server response was not verified.',barberId:'Barber ID',statusNames:{pending:'Pending',confirmed:'Confirmed',completed:'Completed',cancelled:'Cancelled',rejected:'Rejected'}}
});
