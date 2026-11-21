// QR token is a one-time secret. Never put it into analytics or external QR services.
export const isValidQrToken = token => typeof token==='string'&&/^[a-f0-9]{48}$/.test(token);
export const qrStorageKey = token => `ustara:qr:v22:${token}`;
const LABELS={
 pending:'So‘rov sartarosh tasdiqlashini kutmoqda.',
 approved:'Sartarosh tasdiqladi. Siz navbatga qo‘shildingiz.',
 rejected:'Sartarosh so‘rovni rad etdi.',
 expired:'So‘rov muddati tugadi. Yangi QR kerak.',
};
const QUEUE_LABELS={
 waiting:'Navbatingiz kutilmoqda.',
 called:'Sizni chaqirishdi! Sartarosh yoniga boring.',
 arrived:'Kelganingiz tasdiqlandi. Xizmat boshlanishini kuting.',
 in_service:'Xizmatingiz boshlandi.',
 served:'Xizmat yakunlandi.',
 missed:'Navbatda chaqirilganda kelmadingiz.',
 left:'Navbatdan chiqdingiz.',
};
export const statusLabel=(status,queueStatus)=>
 status==='approved'&&QUEUE_LABELS[queueStatus] ? QUEUE_LABELS[queueStatus] : LABELS[status]||'Holat yangilandi.';
export const isActiveTicket=(status,queueStatus)=>status==='pending'||
 (status==='approved'&&(!queueStatus||['waiting','called','arrived','in_service'].includes(queueStatus)));
export const formatWait=estimate=>estimate&&Number.isInteger(estimate.min_minutes)
 &&Number.isInteger(estimate.max_minutes)&&estimate.min_minutes>=0&&estimate.max_minutes>=estimate.min_minutes
 ? `${estimate.min_minutes}–${estimate.max_minutes} daqiqa (taxminiy)` : null;

