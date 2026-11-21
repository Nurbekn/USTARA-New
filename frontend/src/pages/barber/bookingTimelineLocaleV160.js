// Self-contained labels; no changes to the legacy booking action translations.
const copy = {
  uz: {
    title:'Kunlik bron timeline', description:'Bronlar vaqt va holat bo‘yicha. Ranglar band vaqtni tasdiqlamaydi.',
    previous:'Oldingi kun', next:'Keyingi kun', today:'Bugun', selectDate:'Kunni tanlash',
    noBookings:'Bu kunda bronlar yo‘q.', count:'ta bron', nextDayMark:'(ertasi kun)',
    invalid:'Ba’zi bronlar noto‘g‘ri ma’lumot sabab ko‘rsatilmadi.',
    unavailable:'Bronlarni yuklab bo‘lmadi, timeline ko‘rsatilmaydi.',
    pending:'Kutilmoqda', confirmed:'Tasdiqlangan', completed:'Bajarilgan',
    cancelled:'Bekor qilingan', rejected:'Rad etilgan',
  },
  ru: {
    title:'Хронология записей за день', description:'Записи по времени и статусу. Цвет не означает подтверждённую занятость.',
    previous:'Предыдущий день', next:'Следующий день', today:'Сегодня', selectDate:'Выбрать день',
    noBookings:'На этот день записей нет.', count:'записей', nextDayMark:'(следующий день)',
    invalid:'Некоторые записи не показаны из-за некорректных данных.',
    unavailable:'Не удалось загрузить записи. Хронология недоступна.',
    pending:'Ожидает', confirmed:'Подтверждено', completed:'Завершено',
    cancelled:'Отменено', rejected:'Отклонено',
  },
  en: {
    title:'Daily booking timeline', description:'Bookings in time order by status. Color does not confirm occupied time.',
    previous:'Previous day', next:'Next day', today:'Today', selectDate:'Select day',
    noBookings:'No bookings for this day.', count:'bookings', nextDayMark:'(next day)',
    invalid:'Some bookings were hidden due to invalid data.',
    unavailable:'Bookings could not be loaded; timeline is unavailable.',
    pending:'Pending', confirmed:'Confirmed', completed:'Completed',
    cancelled:'Cancelled', rejected:'Rejected',
  },
};
export function bookingTimelineText(lang) {return copy[lang] || copy.uz;}
