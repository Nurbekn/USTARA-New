import { isValidLocation } from '../../../components/locationSearch.js';

const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function validateSetupHours(hours) {
  if (!Array.isArray(hours) || hours.length !== 7) return 'Ish jadvali 7 kundan iborat bo‘lishi kerak.';
  const seen = new Set();
  for (const item of hours) {
    if (!item || !Number.isInteger(item.day) || item.day < 0 || item.day > 6 || seen.has(item.day)
      || typeof item.isOff !== 'boolean') return 'Ish jadvalidagi kunlar takrorlangan yoki noto‘g‘ri.';
    seen.add(item.day);
    if (!item.isOff && (!CLOCK.test(item.start) || !CLOCK.test(item.end) || item.start >= item.end))
      return 'Ish kuni boshlanishi va tugashi noto‘g‘ri.';
  }
  if (hours.every(day => day.isOff)) return 'Kamida bitta ish kunini tanlang.';
  return '';
}

export function validateSetupDraft(draft) {
  const errors = {};
  if (!draft || typeof draft !== 'object') return { submit: 'Profil ma’lumotlari noto‘g‘ri.' };
  if (typeof draft.address !== 'string' || Array.from(draft.address.trim()).length > 500) errors.address = 'Manzil 500 belgidan oshmasligi kerak.';
  if (draft.location != null && !isValidLocation(draft.location)) errors.location = 'Xaritada to‘g‘ri nuqtani tanlang.';
  if (draft.location && !draft.address?.trim()) errors.address = 'Xaritadagi nuqtaga manzilni ham kiriting.';
  const hoursError = validateSetupHours(draft.hours);
  if (hoursError) errors.hours = hoursError;
  return errors;
}

export const defaultSetupHours = () => Array.from({ length: 7 }, (_, day) => ({ day, isOff: day === 0, start: '09:00', end: '18:00' }));
export function setupHoursFromServer(rows) {
  if (!Array.isArray(rows)) throw new Error('Ish jadvali serverdan olinmadi.');
  if (!rows.length) return defaultSetupHours();
  if (rows.length > 7) throw new Error('Serverdagi ish jadvali noto‘g‘ri.');
  const hours = defaultSetupHours().map(day => ({ ...day, isOff: true }));
  const seen = new Set();
  for (const item of rows) {
    if (!Number.isInteger(item.day_of_week) || !hours[item.day_of_week] || seen.has(item.day_of_week)) throw new Error('Serverdagi ish jadvali noto‘g‘ri.');
    seen.add(item.day_of_week);
    const start = typeof item.start_time === 'string' ? item.start_time : '';
    const end = typeof item.end_time === 'string' ? item.end_time : '';
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(start)
      || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(end)
      || start.slice(0, 5) >= end.slice(0, 5)) throw new Error('Serverdagi ish jadvali noto‘g‘ri.');
    hours[item.day_of_week] = { day: item.day_of_week, isOff: false, start: start.slice(0, 5), end: end.slice(0, 5) };
  }
  return hours;
}
export function createBarberSetupApi({ request, getSession, setSession }) {
  const session = () => {
    const current = getSession();
    if (current?.role !== 'barber' || !current.token || !Number.isInteger(current.profileId)) throw new Error('Sartarosh sessiyasi yaroqsiz. Qayta kiring.');
    return current;
  };
  return {
    async load(signal) {
      const current = session();
      const [result, hours] = await Promise.all([
        request('GET', '/api/barbers/me', { token: current.token, signal }),
        request('GET', '/api/barbers/working-hours', { token: current.token, signal }),
      ]);
      const profile = result?.barber;
      if (profile?.id !== current.profileId) throw new Error('Sartarosh profili serverdan olinmadi.');
      const latest = session();
      if (latest.accountId !== current.accountId || latest.token !== current.token || latest.profileId !== current.profileId)
        throw new Error('Sessiya o‘zgardi. Sahifani yangilang.');
      if (profile.latitude != null && !Number.isFinite(profile.latitude) || profile.longitude != null && !Number.isFinite(profile.longitude)
        || (profile.latitude == null) !== (profile.longitude == null)
        || (profile.latitude != null && !isValidLocation({ lat: profile.latitude, lng: profile.longitude })))
        throw new Error('Serverdagi joylashuv ma’lumotlari noto‘g‘ri.');
      return { profile, address: profile.address || '', location: Number.isFinite(profile.latitude) && Number.isFinite(profile.longitude) ? { lat: profile.latitude, lng: profile.longitude } : null, hours: setupHoursFromServer(hours) };
    },
    async save({ address = '', location = null, hours }, signal) {
      const current = session();
      const issues = validateSetupDraft({ address, location, hours });
      if (Object.keys(issues).length) throw new Error(Object.values(issues)[0]);
      const working_hours = hours.filter(day => !day.isOff).map(day => ({ day_of_week: day.day, start_time: day.start, end_time: day.end }));
      const result = await request('PUT', '/api/barbers/setup', { token: current.token, signal, body: { address: address.trim(), location, working_hours } });
      if (result?.barber?.id !== current.profileId || !['pending', 'approved'].includes(result.barber.verification_status) || !Array.isArray(result.working_hours)) throw new Error('Server saqlangan ma’lumotlarni tasdiqlamadi.');
      const latest = session();
      if (latest.accountId !== current.accountId || latest.token !== current.token || latest.profileId !== current.profileId) throw new Error('Sessiya o‘zgardi. Sahifani yangilang.');
      if (result.working_hours.length !== working_hours.length
        || !working_hours.every(expected => result.working_hours.some(got => got.day_of_week === expected.day_of_week
          && String(got.start_time).slice(0, 5) === expected.start_time
          && String(got.end_time).slice(0, 5) === expected.end_time)))
        throw new Error('Server ish jadvalini tasdiqlamadi.');
      setSession({ ...latest, setupDone: true, verification_status: result.barber.verification_status });
      return result.barber.verification_status === 'approved' ? '/barber' : '/barber/pending';
    },
  };
}
async function api() {
  const [{ request }, { getSession, setSession }] = await Promise.all([import('../../../api/client.js'), import('../../auth/utils/session.js')]);
  return createBarberSetupApi({ request, getSession, setSession });
}
export const loadBarberSetup = async signal => (await api()).load(signal);
export const saveBarberSetup = async (draft, signal) => (await api()).save(draft, signal);
