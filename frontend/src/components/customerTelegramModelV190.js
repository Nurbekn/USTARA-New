/** Customer Telegram opt-in is separate from registration OTP. */
export function safeCustomerTelegramLink(value) {
  return typeof value === 'string' &&
    /^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}\?start=cust_[0-9a-f]{48}$/.test(value);
}
export function sameCustomerSession(before, after) {
  return !!before?.token && before.role === 'customer' && before.token === after?.token &&
    before.accountId === after?.accountId && before.profileId === after?.profileId &&
    after?.role === 'customer';
}
export function validCustomerTelegramStatus(value) {
  return !!value && typeof value.linked === 'boolean' &&
    (value.notificationsEnabled === undefined || typeof value.notificationsEnabled === 'boolean') &&
    (!value.notificationsEnabled || value.linked);
}
