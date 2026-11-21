// Admin view helper. Backend remains the sole authority for suspension state.
export function suspensionUrlV187(role,id){
  if(!['customer','barber'].includes(role)||!Number.isSafeInteger(id)||id<1||id>2147483647)return null;
  return `/api/admin/users/${role}/${id}/suspension`;
}
export function validSuspensionResultV187(value,role,id,action){
  return !!value && value.role===role && value.profileId===id &&
    value.suspended===(action==='suspend') && value.sessionsRevoked===true && value.bookingsChanged===false;
}
export const suspensionLocaleV187={
  uz:{suspend:'Vaqtincha to‘xtatish',restore:'Qayta faollashtirish',suspended:'Admin tomonidan to‘xtatilgan',
    active:'Faol',deactivated:'O‘zi faolsizlantirgan',unavailable:'Akkaunt holati tasdiqlanmadi. Ro‘yxatni yangilang; so‘rovni avtomatik takrorlamang.',
    reason:'Sababni kiriting (5–300 belgi). Parol yoki shaxsiy ma’lumot yozmang:',
    warning:n=>`Akkauntni to‘xtatish mavjud ${n} ta faol/kelajakdagi bronni bekor qilmaydi. Mijoz va sartarosh bilan alohida kelishing. Faol qurilma sessiyalari chiqariladi. Davom etilsinmi?`,
    restoreWarning:'Akkaunt blokdan chiqariladi, ammo eski sessiyalar tiklanmaydi. Akkaunt egasi qayta kirishi kerak; o‘zi faolsizlantirgan hisob esa baribir faolsiz qoladi. Davom etilsinmi?'},
  ru:{suspend:'Приостановить',restore:'Восстановить',suspended:'Приостановлен администратором',active:'Активен',deactivated:'Отключён пользователем',
    unavailable:'Статус не подтверждён. Обновите список, не повторяйте запрос автоматически.',
    reason:'Укажите причину (5–300 символов). Не вводите пароли и личные данные:',
    warning:n=>`Приостановка не отменяет ${n} активных/будущих записей. Согласуйте их отдельно. Активные сеансы будут отозваны. Продолжить?`,
    restoreWarning:'Доступ будет восстановлен, но старые сеансы останутся отозванными. Пользователю нужно войти снова; собственная деактивация продолжит действовать. Продолжить?'},
  en:{suspend:'Suspend',restore:'Restore',suspended:'Suspended by Admin',active:'Active',deactivated:'Deactivated by user',
    unavailable:'Account state is unconfirmed. Refresh the list; do not retry automatically.',
    reason:'Enter a reason (5–300 characters). Do not include passwords or personal data:',
    warning:n=>`Suspension will NOT cancel ${n} active/upcoming bookings. Resolve them separately with affected people. Device sessions will be revoked. Continue?`,
    restoreWarning:'Access will be restored but old sessions will remain revoked. The user must sign in again; user-requested deactivation still applies. Continue?'}
};
