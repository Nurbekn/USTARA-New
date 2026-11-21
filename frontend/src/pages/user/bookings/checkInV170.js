// #102: customer arrival REQUEST and explicit barber confirmation are separate.
export const checkInText = Object.freeze({
  uz: {title:'Kelganlikni bildirish', hint:'Bu faqat kelganingiz haqidagi so‘rov. Sartarosh tasdiqlamaguncha kelganlik tasdiqlangan hisoblanmaydi. Bron vaqti o‘zgarmaydi.',report:'Yetib keldim',pending:'Sartarosh tasdig‘i kutilmoqda',confirmed:'Sartarosh kelganingizni tasdiqladi',reload:'Bronni yangilash',unavailable:'Kelganingizni bron boshlanishidan 90 daqiqa avvaldan 30 daqiqa keyingacha bildirishingiz mumkin.',busy:'Saqlanmoqda…',failed:'Kelganlikni tasdiqlab bo‘lmadi. Holatini tekshiring.'},
  ru: {title:'Отметка о прибытии', hint:'Это только запрос. Прибытие считается подтверждённым лишь после подтверждения мастером. Время записи не меняется.',report:'Я на месте',pending:'Ожидание подтверждения мастера',confirmed:'Мастер подтвердил прибытие',reload:'Обновить запись',unavailable:'Отметиться можно за 90 минут до записи и до 30 минут после её начала.',busy:'Сохранение…',failed:'Не удалось подтвердить отметку. Проверьте её статус.'},
  en: {title:'Arrival check-in',hint:'This only requests check-in. Arrival is not confirmed until the barber approves it. Your booking time is unchanged.',report:'I have arrived',pending:'Waiting for barber confirmation',confirmed:'Barber confirmed arrival',reload:'Refresh booking',unavailable:'Check-in is available from 90 minutes before to 30 minutes after the appointment begins.',busy:'Saving…',failed:'Check-in status could not be verified. Refresh your booking.'},
});
export const checkInUi = lang => checkInText[lang] || checkInText.uz;
export function parseCheckIn(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.requestedAt !== 'string')
    throw new Error('Serverdan check-in holati noto‘g‘ri qaytdi.');
  const requested = Date.parse(value.requestedAt);
  const confirmed = value.confirmedAt == null ? null : (typeof value.confirmedAt === 'string' ? Date.parse(value.confirmedAt) : NaN);
  if (!Number.isFinite(requested) || (confirmed !== null && (!Number.isFinite(confirmed) || confirmed < requested)))
    throw new Error('Serverdan check-in holati noto‘g‘ri qaytdi.');
  return { requestedAt: new Date(requested).toISOString(), confirmedAt: confirmed === null ? null : new Date(confirmed).toISOString() };
}
export function canRequestCheckIn(booking, now = Date.now()) {
  const start = Date.parse(booking?.startsAt);
  return booking?.status === 'confirmed' && !booking?.checkIn && Number.isFinite(start) &&
    Number.isFinite(now) && now >= start - 90*60_000 && now <= start + 30*60_000;
}
export async function mutateCheckIn(id, kind, {signal} = {}) {
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647 || !['customer','barber'].includes(kind))
    throw new Error('Noto‘g‘ri check-in so‘rovi.');
  const [{getSession},{request}] = await Promise.all([
    import('../../auth/utils/session.js'),import('../../../api/client.js'),
  ]);
  const session = getSession();
  if (session?.role !== kind || !session.token || !Number.isSafeInteger(session.profileId) || session.profileId < 1)
    throw new Error('Check-in uchun to‘g‘ri akkaunt kerak.');
  const path = `/api/bookings/${id}/check-in${kind === 'barber' ? '/confirm' : ''}`;
  const response = await request('POST',path,{token:session.token,body:{},signal});
  const next = getSession();
  if (next?.token !== session.token || next?.profileId !== session.profileId || next?.accountId !== session.accountId)
    throw Object.assign(new Error('Akkaunt almashgan. Bronlarni yangilang.'),{code:'session_changed'});
  const data = parseCheckIn(response);
  if (!data || (kind === 'barber' && !data.confirmedAt)) throw new Error('Server check-in holatini tasdiqlamadi.');
  return data;
}
