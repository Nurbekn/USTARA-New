// #177 — fail-closed Account Impact Preview; this is not a deletion authorization.
export function accountImpactUrlV186(role,id){
  if(!['customer','barber'].includes(role)||!Number.isSafeInteger(id)||id<1||id>2147483647)return null;
  return `/api/admin/users/${role}/${id}/booking-impact`;
}
export function validateAccountImpactV186(data,role,id){
  return !!data&&data.readOnly===true&&data.role===role&&data.profileId===id
    &&Number.isSafeInteger(data.activeCount)&&data.activeCount>=0
    &&data.hasUnfinishedBookings===(data.activeCount>0)
    &&(data.earliestBookingTime===null || (typeof data.earliestBookingTime==='string'
       &&Number.isFinite(Date.parse(data.earliestBookingTime))));
}
export const accountImpactTextV186={
  uz:{unavailable:'Bronlar tekshiruvi muvaffaqiyatsiz. O‘chirish to‘xtatildi.',
    blocked:n=>`Akkauntda ${n} ta faol yoki kelajakdagi bron mavjud. Avval ularni kelishilgan tartibda hal qiling. O‘chirish bloklandi.`,
    confirm:'Tekshiruvda faol bron topilmadi. Tekshiruvdan keyingi o‘zgarishlar serverda yana tekshiriladi.'},
  ru:{unavailable:'Не удалось проверить записи. Удаление остановлено.',
    blocked:n=>`Есть активные или будущие записи: ${n}. Сначала урегулируйте их. Удаление заблокировано.`,
    confirm:'Активных записей не найдено. Сервер повторно проверит данные перед удалением.'},
  en:{unavailable:'Booking check failed. Deletion stopped.',
    blocked:n=>`${n} active or upcoming bookings must be resolved first. Deletion is blocked.`,
    confirm:'No unfinished bookings were found. The server will check again before deletion.'}
};
