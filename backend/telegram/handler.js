const { RegistrationError } = require("../utils/registration");
const { TelegramLinkError } = require("../services/telegramLinkService");
const { CustomerTelegramError } = require("../services/customerTelegramLinkV190");
const { createBookingCallbackHandler } = require("./bookingCallbacks");
const { createOfferCallbackHandler } = require("./offerCallbacks");
const { privateSender } = require('../services/telegramOtp');
const { BUTTONS, menuKeyboard, contactKeyboard, MENU_TEXT } = require("./menu");
const HELP = "Ustara profilida Telegram bog‘lash tugmasini bosing. 5 daqiqalik /start <token> buyrug‘ini shu shaxsiy chatga yuboring. /status — bog‘lanish holati. Uzish Ustara profilingizda bajariladi.";
function createUpdateHandler({ service, api, username, bookings, botId, logger, contacts, registration, phoneChange, rateLimit, queueNotify, offerDecisions, customerTelegram }) {
  // Webhook injects transaction-bound services and defers this informational API
  // until commit. The registration service owns its separate OTP transport.
  const callback = bookings && createBookingCallbackHandler({ bookings, api, botId, logger });
  const offerCallback = offerDecisions && createOfferCallbackHandler({offers:offerDecisions,api,botId});
  return async (update, signal) => {
    if (update?.callback_query) {
      if (typeof update.callback_query.data === 'string' && update.callback_query.data.startsWith('so:')) {
        if (offerCallback) await offerCallback(update.callback_query,signal);
      } else if (callback) await callback(update.callback_query, signal);
      return;
    }
    const message = update?.message;
    if (!privateSender(message)) return;
    if (rateLimit && !await rateLimit('telegram', String(message.from.id), 30, 60)) return;
    if (contacts && message.contact) {
      for (const flow of [phoneChange, registration].filter(Boolean)) {
        try {
          const result = await flow.contact(message);
          if (result) {
            await api('sendMessage', { chat_id: message.chat.id, protect_content: true,
              text: result.body.code === 'otp_sent' ? 'Raqam mos keldi. Tasdiqlash kodi yuqorida yuborildi. Saytga qaytib kodni kiriting.' : result.body.message,
              reply_markup: { remove_keyboard: true } }, signal);
            return;
          }
        } catch (error) {
          if (!(error instanceof RegistrationError)) throw error;
          await api('sendMessage', { chat_id: message.chat.id, text: error.message, protect_content: true }, signal);
          return;
        }
      }
      await api("sendMessage", { chat_id: message.chat.id, protect_content: true,
        text: 'Faol so‘rov topilmadi. Avval Ustara saytida ro‘yxatdan o‘tishni boshlang.',
        reply_markup: { remove_keyboard: true },
      }, signal);
      return;
    }
    if (typeof message.text !== "string") return;
    const command = /^\/(start|help|status|menu|phone|bookings|stopqueue)(?:@([A-Za-z0-9_]+))?(?:\s+([^\s]+))?\s*$/.exec(message.text);
    if (command?.[2] && command[2].toLowerCase() !== username.toLowerCase()) return;
    const action = command?.[1] || ({
      [BUTTONS.otp]: 'otp', [BUTTONS.phone]: 'phone',
      [BUTTONS.bookings]: 'bookings', [BUTTONS.status]: 'status',
      [BUTTONS.help]: 'menu',
    })[message.text.trim()];
    if (!action) return;
    const chatId = message.chat.id;
    if (action === 'start' && command?.[3]?.startsWith('cust_') && customerTelegram) {
      let text;
      try {
        await customerTelegram.consume(command[3], chatId);
        text = 'Telegram mijoz profilingizga bog‘landi. Bildirishnomalarga rozilikni saytdan alohida yoqing.';
      } catch(error) {
        if (!(error instanceof CustomerTelegramError)) throw error;
        text = error.message;
      }
      await api('sendMessage',{chat_id:chatId,text,protect_content:true},signal);
      return;
    }
    if (action === 'start' && command?.[3]?.startsWith('qnotify_') && queueNotify) {
      let text;
      try { await queueNotify.consume(command[3].slice(8), chatId);
        text = 'Navbatingiz bo‘yicha Telegram xabarlari yoqildi. To‘xtatish: /stopqueue'; }
      catch (error) {
        if (!error.status || error.status >= 500) throw error;
        text = error.message;
      }
      await api('sendMessage', {chat_id:chatId,text,protect_content:true}, signal);
      return;
    }
    if (action === 'stopqueue' && queueNotify) {
      await queueNotify.stopChat(chatId);
      await api('sendMessage',{chat_id:chatId,protect_content:true,
        text:'Navbat xabarlari to‘xtatildi. QR sahifasidan qayta ulash mumkin.'},signal);
      return;
    }
    if (phoneChange && action === 'start' && command?.[3]?.startsWith('pc_')) {
      try {
        await phoneChange.open(message, command[3]);
        await api('sendMessage', { chat_id: chatId, protect_content: true,
          text: 'Yangi raqamingizni tasdiqlash uchun o‘z kontaktingizni ulashing.',
          reply_markup: contactKeyboard() }, signal);
      } catch (error) {
        if (!(error instanceof RegistrationError)) throw error;
        await api('sendMessage', { chat_id: chatId, protect_content: true, text: error.message }, signal);
      }
      return;
    }
    if (contacts && ((action === 'start' && (command?.[3] === 'otp' || command?.[3]?.startsWith('reg_'))) || action === 'otp')) {
      if (phoneChange) await phoneChange.clearChat(message);
      await api('sendMessage', { chat_id: chatId, protect_content: true,
        text: 'Tasdiqlash kodini olish uchun o‘z telefon kontaktingizni ulashing.',
        reply_markup: contactKeyboard(),
      }, signal);
      return;
    }
    if (action === 'menu' || action === 'help' || (action === 'start' && !command?.[3])) {
      if (action === 'start' && phoneChange) await phoneChange.clearChat(message);
      await api('sendMessage', { chat_id: chatId, text: MENU_TEXT, protect_content: true,
        reply_markup: menuKeyboard() }, signal);
      return;
    }
    if (action === 'phone' || action === 'bookings') {
      let text;
      if (action === 'phone') {
        text = 'Telefon raqamini almashtirish uchun USTARA saytida Profil → Telefon raqami bo‘limidan so‘rovni boshlang. Keyin botdagi tasdiqlash bosqichini bajaring. Kod yoki parolni chatga yozmang.';
      } else if (typeof service?.chatUpcomingBookings === 'function') {
        const bookings = await service.chatUpcomingBookings(chatId);
        const formatter = new Intl.DateTimeFormat('uz-UZ', { timeZone: 'Asia/Tashkent',
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
        text = bookings === null ? 'Bronlarni ko‘rish uchun USTARA saytidagi Sartarosh profili orqali Telegramni bog‘lang.'
          : bookings.length ? ['Yaqinlashayotgan bronlar (oxirgi 5 tasi):',
            ...bookings.map(b => `#${b.id} · ${formatter.format(new Date(b.booking_time))} · ${String(b.service_name).replace(/[\r\n\t]/g, ' ').slice(0, 80)} · ${b.status === 'confirmed' ? 'Tasdiqlangan' : 'Kutilmoqda'}`),
            'Boshqa bronlar va to‘liq tafsilotlar saytdagi Bronlar bo‘limida.'].join('\n')
            : 'Hozir yaqinlashayotgan faol bronlar yo‘q. Barcha bronlar saytdagi Bronlar bo‘limida.';
      } else {
        text = 'Bronlar va bron tarixini USTARA saytining Bronlar bo‘limida ko‘ring. Yangi bronlar haqida bildirishnomalar bog‘langan Telegram orqali keladi.';
      }
      await api('sendMessage', { chat_id: chatId, text, protect_content: true,
        reply_markup: menuKeyboard() }, signal);
      return;
    }
    let text;
    if (action === "start" && command?.[3]) {
      try { await service.consume(command[3], chatId); text = "Telegram hisobingiz Ustara barber profiliga bog‘landi."; }
      catch (error) {
        if (error instanceof TelegramLinkError) text = error.message;
        else if (error.code === "23505") text = "Bu Telegram hisobi allaqachon bog‘langan. Avval Ustara profilidan bog‘lanishni uzing.";
        else throw error; // Retry DB failures without acknowledging the update.
      }
    } else if (action === "status") {
      text = await service.chatStatus(chatId) ? "Telegram hisobingiz Ustara bilan bog‘langan." : "Telegram hisobingiz Ustara bilan bog‘lanmagan.";
    } else text = HELP;
    await api("sendMessage", { chat_id: chatId, text, protect_content: true,
      reply_markup: action === "status" ? menuKeyboard() : undefined }, signal);
  };
}
module.exports = { createUpdateHandler };
