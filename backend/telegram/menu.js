// Minimal, private-chat-only menu. Buttons send ordinary text messages;
// authorization still happens inside the existing website/OTP workflows.
const BUTTONS = Object.freeze({
  otp: '🔐 Tasdiqlash kodi',
  phone: '📱 Raqamni almashtirish',
  bookings: '📅 Bronlar',
  status: '🔗 Bog‘lanish holati',
  help: 'ℹ️ Yordam',
});

function menuKeyboard() {
  return { keyboard: [
    [{ text: BUTTONS.otp }, { text: BUTTONS.phone }],
    [{ text: BUTTONS.bookings }, { text: BUTTONS.status }],
    [{ text: BUTTONS.help }],
  ], resize_keyboard: true, is_persistent: true };
}

function contactKeyboard() {
  return { keyboard: [[{ text: 'Telefon raqamimni ulashish', request_contact: true }]],
    resize_keyboard: true, one_time_keyboard: true };
}

const MENU_TEXT = [
  'USTARA yordamchi boti',
  '🔐 Tasdiqlash kodi — avval sayt orqali tasdiqlash so‘rovini boshlang.',
  '📱 Raqamni almashtirish — avval saytdagi Profil → Telefon raqami bo‘limidan boshlang.',
  '📅 Bronlar — bronlaringizni USTARA saytidagi Bronlar bo‘limida ko‘ring.',
  '🔗 Bog‘lanish holati — sartarosh Telegram bog‘lanishini tekshiring.',
  'Navbat uchun ixtiyoriy Telegram xabarlarini QR oynasida yoqing; to‘xtatish: /stopqueue.',
  'Bot sizdan hech qachon parol yoki OTP kodini chatga yozishni so‘ramaydi.',
].join('\n');
module.exports = { BUTTONS, menuKeyboard, contactKeyboard, MENU_TEXT };
