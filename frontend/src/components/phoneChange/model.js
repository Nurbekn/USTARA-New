export function insertOtp(current, index, text) {
  const digits = String(text).replace(/\D/g, '').slice(0, 5);
  const next = [...current];
  const start = digits.length === 5 ? 0 : index;
  if (!digits) next[index] = '';
  else [...digits].forEach((digit, offset) => { if (start + offset < 5) next[start + offset] = digit; });
  return { digits: next, focus: Math.min(start + digits.length, 4) };
}
export const secondsUntil = (deadline, now) => Math.max(0, Math.ceil((Number(deadline) - now) / 1000));
export function serverDeadline(date, serverNow, receivedAt = Date.now()) {
  if (!date || !serverNow) return 0;
  return receivedAt + Date.parse(date) - Date.parse(serverNow);
}
export function createPhoneChangeApi({ request, getToken }) {
  return async (action, body, signal) => {
    if (!['start', 'choose', 'status', 'resend', 'verify'].includes(action)) throw new Error('Noto‘g‘ri amal.');
    const token = getToken();
    if (!token) throw new Error('Qayta tizimga kiring.');
    return request('POST', `/api/auth/phone-change/${action}`, { body, token, signal });
  };
}
export async function phoneChangeRequest(action, body, signal) {
  const [{ request }, { getSession }] = await Promise.all([import('../../api/client.js'), import('../../pages/auth/utils/session.js')]);
  return createPhoneChangeApi({ request, getToken: () => getSession()?.token })(action, body, signal);
}
