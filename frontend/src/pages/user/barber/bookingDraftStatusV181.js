// #183: a local draft is NOT a committed booking, slot hold or offline POST.
// Never store access tokens, user identities, private booking notes, or prices.
import { DRAFT_TTL_MS, readBookingDraft, saveBookingDraft } from './bookingDraft.js';

export function persistBookingSelectionV181(selection, storage, now = Date.now()) {
  if (!Array.isArray(selection?.serviceIds) || !selection.serviceIds.length)
    return { kind: 'none' };
  if (!saveBookingDraft(selection, storage, now)) return { kind: 'failed' };
  const confirmed = readBookingDraft(storage, now);
  if (!confirmed || confirmed.barberId !== selection.barberId
    || confirmed.date !== selection.date || confirmed.time !== (selection.time ?? '')
    || JSON.stringify(confirmed.serviceIds) !== JSON.stringify(selection.serviceIds))
    return { kind: 'failed' };
  return { kind: 'saved', expiresAt: confirmed.createdAt + DRAFT_TTL_MS };
}

const copy = Object.freeze({
  uz: Object.freeze({
    saved: 'Tanlov shu brauzer oynasida 5 daqiqagacha vaqtincha saqlanadi. Bu bron emas, vaqt band qilinmagan. Internet uzilsa ham bron avtomatik yuborilmaydi.',
    failed: 'Tanlovni brauzerda saqlab bo‘lmadi. Brauzer xotirasini tekshiring yoki qayta urinib ko‘ring. Hali bron yaratilmagan.',
    expired: 'Tanlovning 5 daqiqalik saqlash muddati tugadi. Qayta saqlashingiz mumkin. Bu bron emas.',
    retry: 'Tanlovni qayta saqlash',
  }),
  ru: Object.freeze({
    saved: 'Выбор временно сохранён только в этой вкладке (до 5 минут). Это не запись и не резерв времени. При отключении интернета запрос не отправится автоматически.',
    failed: 'Не удалось сохранить выбор в браузере. Проверьте настройки памяти или повторите попытку. Запись не создана.',
    expired: 'Пятиминутный срок хранения выбора истёк. Его можно сохранить снова. Это не запись.',
    retry: 'Сохранить выбор ещё раз',
  }),
  en: Object.freeze({
    saved: 'Selection saved in this browser tab for up to five minutes. This is not a booking or a slot hold. Nothing is submitted automatically when offline.',
    failed: 'Could not save your selection in this browser. Check storage permissions or retry. No booking was created.',
    expired: 'The five-minute saved-selection period has expired. You can save it again. This is not a booking.',
    retry: 'Save selection again',
  }),
});
export function bookingDraftStatusCopyV181(lang = 'uz') { return copy[lang] ?? copy.uz; }
