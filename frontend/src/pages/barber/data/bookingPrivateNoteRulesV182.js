// Pure, dependency-free validation and translations for #179.
export const PRIVATE_NOTE_LIMIT_V182 = 500;
const idOk = id => Number.isSafeInteger(Number(id)) && Number(id) > 0 && Number(id) <= 2147483647;
const identity = s => `${s?.accountId}:${s?.profileId}:${s?.token}`;
export const normalizePrivateNote = text => typeof text === 'string' ? text.trim() : '';
export const validPrivateNote = text => typeof text === 'string'
  && text === text.trim() && Array.from(text).length >= 1 && Array.from(text).length <= PRIVATE_NOTE_LIMIT_V182
  && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text);

export const privateBookingNoteTextV182 = Object.freeze({
  uz:{open:'Maxfiy qayd',close:'Yopish',hint:'Faqat siz ko‘rasiz. Mijozga yoki boshqa sartaroshga yuborilmaydi. Bron vaqtidan 90 kun o‘tgach yashiriladi.',placeholder:'Bron uchun shaxsiy qayd…',load:'Qaydni yuklash',save:'Saqlash',remove:'O‘chirish',cancel:'Bekor qilish',reload:'Qayta tekshirish',busy:'Tekshirilmoqda…',unknown:'Qayd holati noma’lum. Qayta saqlamang — avval yangilang.',conflict:'Qayd boshqa oynada o‘zgargan. Yangilang.',deleted:'Qayd o‘chirildi.',saved:'Qayd saqlandi.',empty:'Hozircha qayd yo‘q.'},
  ru:{open:'Личная заметка',close:'Закрыть',hint:'Видна только вам. Не отправляется клиенту или другому мастеру. Скрывается спустя 90 дней после записи.',placeholder:'Личная заметка к записи…',load:'Загрузить',save:'Сохранить',remove:'Удалить',cancel:'Отмена',reload:'Проверить снова',busy:'Проверяем…',unknown:'Статус заметки неизвестен. Перед повторной отправкой обновите.',conflict:'Заметка изменена в другой вкладке. Обновите.',deleted:'Заметка удалена.',saved:'Заметка сохранена.',empty:'Заметки пока нет.'},
  en:{open:'Private note',close:'Close',hint:'Only you can see this. Not shared with clients or other barbers. Hidden 90 days after the appointment.',placeholder:'Your private booking note…',load:'Load note',save:'Save',remove:'Delete',cancel:'Cancel',reload:'Check again',busy:'Checking…',unknown:'Note status unknown. Refresh before trying again.',conflict:'Note changed in another tab. Refresh.',deleted:'Note deleted.',saved:'Note saved.',empty:'No note yet.'},
});
export const privateBookingNoteUiV182 = lang => privateBookingNoteTextV182[lang]||privateBookingNoteTextV182.uz;
