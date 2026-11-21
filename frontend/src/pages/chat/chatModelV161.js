export const QUICK_REPLIES_V161 = Object.freeze({
  uz: ['Salom! Qanday yordam bera olaman?', 'Bo‘sh vaqtlarni profilimdan ko‘rishingiz mumkin.', 'Bron uchun avval xizmat va vaqtni tanlang.'],
  ru: ['Здравствуйте! Чем могу помочь?', 'Свободное время можно посмотреть в моём профиле.', 'Для записи выберите услугу и время.'],
  en: ['Hello! How can I help?', 'You can see my available slots on my profile.', 'Choose a service and time to book.'],
});
export const CHAT_UI_V161 = Object.freeze({
  uz: { title:'Xabarlar', new:'Suhbat boshlash', empty:'Hali suhbat yo‘q.', select:'Suhbatni tanlang.', send:'Yuborish', placeholder:'Xabar yozing…', retry:'Qayta urinish', loading:'Yuklanmoqda…', user:'Mijoz', share:'Postni ulashish', cancelShare:'Postni bekor qilish', shared:'Ulashilgan post', history:'Oxirgi 100 ta xabar ko‘rsatilmoqda.', sourceHuman:'Odam yuborgan', sourceAi:'AI yordamchi', note:'Hozir javoblarni odamlar yozadi. AI chat yoqilmagan. Yangi xabarlar bir necha soniyada yangilanadi.', error:'Chatni yuklab bo‘lmadi.', noApproval:'Bu sartarosh bilan suhbat ochib bo‘lmadi.' },
  ru: { title:'Сообщения', new:'Начать чат', empty:'Пока нет чатов.', select:'Выберите чат.', send:'Отправить', placeholder:'Напишите сообщение…', retry:'Повторить', loading:'Загрузка…', user:'Клиент', share:'Поделиться постом', cancelShare:'Убрать пост', shared:'Публикация', history:'Показаны последние 100 сообщений.', sourceHuman:'Сообщение человека', sourceAi:'AI-помощник', note:'Сейчас отвечают только люди. AI-чат не включён. Новые сообщения обновляются раз в несколько секунд.', error:'Не удалось загрузить чат.', noApproval:'Не удалось открыть чат с этим барбером.' },
  en: { title:'Messages', new:'Start conversation', empty:'No chats yet.', select:'Select a chat.', send:'Send', placeholder:'Type a message…', retry:'Retry', loading:'Loading…', user:'Customer', share:'Share post', cancelShare:'Remove post', shared:'Shared post', history:'Showing the most recent 100 messages.', sourceHuman:'Sent by a person', sourceAi:'AI assistant', note:'People write all replies for now. AI chat is not enabled. New messages refresh every few seconds.', error:'Could not load chat.', noApproval:'Could not start a conversation with this barber.' },
});
export const chatUiV161 = lang => CHAT_UI_V161[lang] || CHAT_UI_V161.uz;
export const chatQuickRepliesV161 = (lang, role) => role === 'barber' ? QUICK_REPLIES_V161[lang] || QUICK_REPLIES_V161.uz : [];
export function parseChatQueryV161(query) {
  const params = new URLSearchParams(query);
  const integer = value => typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647 ? Number(value) : null;
  return { barberId:integer(params.get('barber')), threadId:integer(params.get('thread')), postId:integer(params.get('post')) };
}
export function validateChatMessagesV161(raw) {
  if (!raw || !Array.isArray(raw.messages) || raw.messages.length > 100) throw new Error('Chat javobi noto‘g‘ri.');
  return raw.messages.map(m => {
    if (!m || !Number.isSafeInteger(m.id) || !Number.isSafeInteger(m.senderUserId)
        || typeof m.body !== 'string' || !['human','ai'].includes(m.source) || !Number.isFinite(Date.parse(m.createdAt)))
      throw new Error('Chat javobi noto‘g‘ri.');
    return m;
  });
}
