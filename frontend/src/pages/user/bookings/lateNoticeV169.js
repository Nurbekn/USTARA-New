// v169 #101. Pure presentation guard; the API and DB recheck all permissions and times.
export const MINUTE_CHOICES = Object.freeze([5,10,15,20,30]);
export const lateNoticeText = Object.freeze({
  uz: {title:'Kechikish haqida xabar',hint:'Bu faqat xabar. Bron vaqti o‘zgarmaydi va sartaroshning roziligi kafolatlanmaydi.',minutes:'Taxminiy kechikish (daqiqa)',send:'Xabar yuborish',sending:'Yuborilmoqda…',sent:'Kechikish xabari saqlandi',reported:'Xabar berilgan kechikish',reload:'Bronni yangilash',failed:'Xabarni yuborib bo‘lmadi. Holatini tekshiring.',disabled:'Kechikish xabarini bron boshlanishidan 2 soat avval yoki boshlanganidan keyingi 10 daqiqada yuborish mumkin.',noRepeat:'Bu bron uchun xabar oldin yuborilgan.',customer:'Mijoz kechikish haqida xabar berdi',notConfirmed:'Bron vaqti o‘zgartirilmagan.'},
  ru: {title:'Сообщить об опоздании',hint:'Это лишь уведомление. Время записи не меняется; согласие мастера не гарантировано.',minutes:'Примерное опоздание (минут)',send:'Отправить уведомление',sending:'Отправка…',sent:'Уведомление об опоздании сохранено',reported:'Сообщено об опоздании',reload:'Обновить запись',failed:'Не удалось подтвердить отправку. Проверьте статус.',disabled:'Можно сообщить за 2 часа до записи и в первые 10 минут после начала.',noRepeat:'Уведомление для этой записи уже отправлено.',customer:'Клиент предупредил об опоздании',notConfirmed:'Время записи не изменено.'},
  en: {title:'Report late arrival',hint:'This is a notice only. Your appointment time does not change, and barber approval is not guaranteed.',minutes:'Estimated delay (minutes)',send:'Send notice',sending:'Sending…',sent:'Late-arrival notice saved',reported:'Reported delay',reload:'Refresh booking',failed:'Notice could not be confirmed. Check its status.',disabled:'You may report from 2 hours before the appointment until 10 minutes after it begins.',noRepeat:'A notice was already sent for this booking.',customer:'Customer reported a late arrival',notConfirmed:'Appointment time has not changed.'},
});
export function lateNoticeUi(lang) { return lateNoticeText[lang] || lateNoticeText.uz; }
export function lateNoticeAllowed(booking, now = Date.now()) {
  const start = Date.parse(booking?.startsAt);
  return ['confirmed','pending'].includes(booking?.status) && !booking?.lateNotice
    && Number.isFinite(start) && Number.isFinite(now)
    && now >= start - 2*60*60000 && now <= start + 10*60000;
}
export function parseLateNotice(row) {
  if (row == null) return null;
  const minutes = Number(row.minutes), at = Date.parse(row.reportedAt);
  if (!MINUTE_CHOICES.includes(minutes) || !Number.isFinite(at) || typeof row.reportedAt !== 'string')
    throw new Error('Serverdan kechikish holati noto‘g‘ri qaytdi.');
  return { minutes, reportedAt: new Date(at).toISOString() };
}
export async function sendLateNotice(id, minutes, { signal } = {}) {
  if (!Number.isSafeInteger(id) || id < 1 || !MINUTE_CHOICES.includes(minutes)) throw new Error('Noto‘g‘ri kechikish so‘rovi.');
  const [{ getSession }, { request }] = await Promise.all([
    import('../../auth/utils/session.js'), import('../../../api/client.js'),
  ]);
  const session = getSession();
  if (session?.role !== 'customer' || !session.token || !Number.isSafeInteger(session.profileId))
    throw new Error('Mijoz sessiyasi kerak.');
  const response = await request('POST', `/api/bookings/${id}/late-notice`, { token: session.token, body: {minutes}, signal });
  const current = getSession();
  if (current?.token !== session.token || current?.accountId !== session.accountId || current?.profileId !== session.profileId)
    throw Object.assign(new Error('Akkaunt almashgan. Bronlarni yangilang.'),{code:'session_changed'});
  const parsed = parseLateNotice({ minutes: response?.minutes, reportedAt: response?.reportedAt });
  if (parsed.minutes !== minutes) throw Error('Server boshqa kechikish qiymatini qaytardi.');
  return parsed;
}
