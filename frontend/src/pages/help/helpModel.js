import { HELP_LANGUAGES, HELP_TRANSLATIONS } from './helpTranslations.js';

// v137 — #75 / #78 / #74: public, static, privacy-preserving help.
// No account information or unverified AI advice is loaded or sent to a server.
export const HELP_CATEGORIES = Object.freeze([
  { id: 'all', label: 'Barchasi' },
  { id: 'customer', label: 'Mijozlar' },
  { id: 'barber', label: 'Sartaroshlar' },
  { id: 'privacy', label: 'Xavfsizlik' },
]);

export const HELP_TOPICS = Object.freeze([
  {
    id: 'search', category: 'customer',
    title: 'Sartaroshni qanday qidiraman?',
    answer: 'Sartaroshlar katalogida ism, xizmat yoki sartarosh ko‘rsatgan manzilni yozing. Filtrlar orqali xizmat va narxni aniqlashtiring. Masofaga qarab saralash uchun profilingizda joylashuv bo‘lishi kerak.',
    keywords: 'qidiruv tuman xarita manzil sartarosh narx filter',
    links: [{ label: 'Sartaroshlar katalogi', path: '/explore' }],
  },
  {
    id: 'booking', category: 'customer',
    title: 'Qanday qilib bron qilaman?',
    answer: 'Sartaroshning tasdiqlangan ommaviy profilini oching, xizmatni, kunni va server tasdiqlagan bo‘sh vaqtni tanlang. Yakuniy natija faqat server bronni tasdiqlaganidan keyin ko‘rsatiladi. Tizimga kirish talab qilinishi mumkin.',
    keywords: 'bron xizmat vaqt kun joy',
    links: [{ label: 'Sartaroshni tanlash', path: '/explore' }],
  },
  {
    id: 'bookings', category: 'customer',
    title: 'Bronimni qanday ko‘raman yoki bekor qilaman?',
    answer: 'Akkauntingizdagi Bronlar bo‘limida kelgusi tashriflar va tarixni ko‘rasiz. Bekor qilish faqat ko‘rsatilgan muddat va shartlarga muvofiq bajariladi. Amal natijasi noma’lum bo‘lsa, takror bosishdan oldin bron holatini tekshiring.',
    keywords: 'bronlarim bekor qilish ko‘chirish tarix o‘zgartirish',
    links: [{ label: 'Bronlarim', path: '/user/bookings', auth: true }],
  },
  {
    id: 'queue', category: 'customer',
    title: 'Joyidagi navbat va QR qanday ishlaydi?',
    answer: 'QR yoki oddiy walk-in navbati mavjud bo‘lsa, holatni tegishli navbat sahifasida kuzating. Navbatga qo‘shilish va xizmat taklifi alohida tasdiq talab qilishi mumkin. Taxminiy kutish vaqti kafolatlangan boshlanish vaqti emas.',
    keywords: 'qr navbat walk-in kutish',
    links: [{ label: 'Mening navbatim', path: '/user/queue', auth: true }],
  },
  {
    id: 'profile', category: 'customer',
    title: 'Profil, manzil yoki xizmat ma’lumotida xato bo‘lsa-chi?',
    answer: 'Sartaroshning ommaviy profilidagi “Profil xatosi” bo‘limidan to‘g‘ri bo‘lmagan ma’lumotni xabar qiling. Ko‘rib chiqilayotgan xabar holatini o‘sha profil orqali tekshirishingiz mumkin.',
    keywords: 'shikoyat xato profil ish vaqti manzil xizmat',
    links: [{ label: 'Profilni topish', path: '/explore' }],
  },
  {
    id: 'barber-profile', category: 'barber',
    title: 'Sartarosh profilimni qanday tayyorlayman?',
    answer: 'Sartarosh panelidagi Profil, Xizmatlar va Ish vaqti bo‘limlarida ommaga ko‘rinadigan ma’lumotlarni kiriting. Profilni mijoz ko‘rinishida tekshirish tugmasi faqat tasdiqlangan va faol profil uchun mavjud.',
    keywords: 'barber portfolio xizmat ish vaqti profil tasdiqlash',
    links: [{ label: 'Sartarosh profili', path: '/barber/profile', auth: true }],
  },
  {
    id: 'barber-bookings', category: 'barber',
    title: 'Sartarosh bron va navbatni qayerdan boshqaradi?',
    answer: 'Sartarosh panelida Bronlar va Navbat alohida boshqariladi. Amal natijasi serverdan aniq tasdiqlanmasa, holatni yangilang va natijani tekshiring; bir amalni ko‘r-ko‘rona qayta yubormang.',
    keywords: 'barber bronlar navbat qr bekor keldi',
    links: [{ label: 'Sartarosh bronlari', path: '/barber/bookings', auth: true }],
  },
  {
    id: 'privacy', category: 'privacy',
    title: 'Shaxsiy ma’lumotlarim va ulashilgan havolalar-chi?',
    answer: 'Ommaviy profil havolasini ulashish bron tafsiloti yoki login tokenini ulashmaydi. Shaxsiy bronlar uchun o‘z akkauntingizga kiring. Hech kimga parol, bir martalik OTP kod yoki login tokenini yubormang.',
    keywords: 'telefon xavfsizlik sessiya maxfiylik otp token link ulashish',
    links: [{ label: 'Akkauntga kirish', path: '/login' }],
  },
]);

export function normalizeHelpSearch(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[‘’`ʻʼ]/g, "'")
    .toLocaleLowerCase('uz')
    .replace(/\s+/g, ' ')
    .trim();
}

export function readHelpFilters(value) {
  const params = value instanceof URLSearchParams ? value : new URLSearchParams(value || '');
  const category = params.getAll('category').length === 1 && HELP_CATEGORIES.some(item => item.id === params.get('category'))
    ? params.get('category') : 'all';
  const topic = params.getAll('topic').length === 1 && HELP_TOPICS.some(item => item.id === params.get('topic'))
    ? params.get('topic') : null;
  // Limit extremely long / duplicated URL search input without reflecting it back into the UI.
  const q = params.getAll('q').length === 1 && (params.get('q') || '').length <= 100
    ? (params.get('q') || '') : '';
  return { category, topic, q };
}

export function findHelpTopics(filters) {
  const { category = 'all', topic = null, q = '', lang = 'uz' } = filters || {};
  const terms = normalizeHelpSearch(q).slice(0, 100).split(' ').filter(Boolean);
  return getHelpTopics(lang).filter(item =>
    (category === 'all' || category === item.category) &&
    (!topic || topic === item.id) &&
    terms.every(word => normalizeHelpSearch(`${item.title} ${item.answer} ${item.keywords}`).includes(word))
  );
}

export function helpTopicUrl(topic) {
  if (!HELP_TOPICS.some(item => item.id === topic)) return '/help';
  return `/help?topic=${encodeURIComponent(topic)}`;
}

// v138 — locale is an explicit, allowlisted public URL parameter. No cookies.
export function readHelpLocale(value) {
  const params = value instanceof URLSearchParams ? value : new URLSearchParams(value || '');
  const languages = params.getAll('lang');
  return languages.length === 1 && HELP_LANGUAGES.some(item => item.id === languages[0])
    ? languages[0] : 'uz';
}

export function getHelpCategories(lang = 'uz') {
  const bundle = HELP_TRANSLATIONS[HELP_LANGUAGES.some(item => item.id === lang) ? lang : 'uz'];
  return HELP_CATEGORIES.map(item => ({ ...item, label: bundle.categories[item.id] }));
}

export function getHelpUi(lang = 'uz') {
  return HELP_TRANSLATIONS[HELP_LANGUAGES.some(item => item.id === lang) ? lang : 'uz'].ui;
}

export function getHelpTopics(lang = 'uz') {
  if (lang === 'uz' || !HELP_LANGUAGES.some(item => item.id === lang)) return HELP_TOPICS;
  const localized = HELP_TRANSLATIONS[lang].topics;
  return HELP_TOPICS.map(topic => ({
    ...topic,
    title: localized[topic.id].title,
    answer: localized[topic.id].answer,
    keywords: localized[topic.id].keywords,
    links: topic.links.map((link, index) => ({ ...link, label: localized[topic.id].links[index] })),
  }));
}

export function localizedHelpTopicUrl(topic, lang = 'uz') {
  const base = helpTopicUrl(topic);
  if (base === '/help') return base;
  return lang === 'ru' || lang === 'en' ? `${base}&lang=${lang}` : base;
}

export function localizedHelpHomeUrl(lang = 'uz') {
  return lang === 'ru' || lang === 'en' ? `/help?lang=${lang}` : '/help';
}
