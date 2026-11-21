// v176 (#145): text only; filter rules/booking mutation logic do not depend on locale.
const copies=Object.freeze({
 uz:Object.freeze({title:'Bronlarni tez topish',search:'Mijoz yoki xizmat nomi, bron #ID',date:'Sana',reset:'Tozalash',count:'Yuklangan bronlar ichida: {count} ta',noMatch:'Bu filtrga mos bron topilmadi.',scope:'Qidiruv faqat shu sahifaga yuklangan bronlar orasida ishlaydi.',refresh:'Serverdan yangilash'}),
 ru:Object.freeze({title:'Быстрый поиск записей',search:'Имя клиента, услуга или № записи',date:'Дата',reset:'Сбросить',count:'Среди загруженных записей: {count}',noMatch:'Нет записей по этим фильтрам.',scope:'Поиск действует только среди загруженных на эту страницу записей.',refresh:'Обновить с сервера'}),
 en:Object.freeze({title:'Find bookings quickly',search:'Customer, service or booking #ID',date:'Date',reset:'Clear',count:'Among loaded bookings: {count}',noMatch:'No bookings match these filters.',scope:'Search only covers bookings loaded on this page.',refresh:'Refresh from server'}),
});
export function bookingInboxLocaleV176(lang='uz') {
 return Object.hasOwn(copies,lang)?copies[lang]:copies.uz;
}
