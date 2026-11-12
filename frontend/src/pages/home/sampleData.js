// TODO: replace with API. Fictional visual-preview data only; never real accounts.
const image = (name) => `${import.meta.env.BASE_URL}images/${name}`;

export const sampleBarbers = [
  { id: 'demo-barber-1', verification: { approvedByAdmin: true, trusted: true, skilled: true }, name: 'Aziz Karimov', salonName: 'Chiziq Studio', area: 'Chilonzor', address: 'Chilonzor tumani, Toshkent', region: 'Toshkent shahri', startingPrice: 60000, rating: 4.9, reviewCount: 24, available: true, serviceIds: ['demo-fade', 'demo-beard'], location: { lat: 41.285, lng: 69.203 }, workPhoto: image('style-inspiration.png'), position: '0%' },
  { id: 'demo-barber-2', verification: { approvedByAdmin: true, trusted: false, skilled: true }, name: 'Sardor Aliyev', salonName: 'Forma Barbershop', area: 'Yunusobod', address: 'Yunusobod tumani, Toshkent', region: 'Toshkent shahri', startingPrice: 80000, rating: 4.8, reviewCount: 18, available: true, serviceIds: ['demo-texture', 'demo-beard'], location: { lat: 41.363, lng: 69.288 }, workPhoto: image('style-inspiration.png'), position: '50%' },
  { id: 'demo-barber-3', verification: { approvedByAdmin: false, trusted: false, skilled: false }, name: 'Javohir Rasulov', salonName: 'Tartib Studio', area: 'Mirobod', address: 'Mirobod tumani, Toshkent', region: 'Toshkent shahri', startingPrice: 70000, rating: 4.9, reviewCount: 32, available: false, serviceIds: ['demo-classic', 'demo-beard'], location: { lat: 41.293, lng: 69.278 }, workPhoto: image('style-inspiration.png'), position: '100%' },
  { id: 'demo-barber-4', verification: { approvedByAdmin: true, trusted: true, skilled: false }, name: 'Otabek Ergashev', salonName: 'Nuqta Studio', area: 'Shayxontohur', address: 'Shayxontohur tumani, Toshkent', region: 'Toshkent shahri', startingPrice: 65000, rating: 4.7, reviewCount: 16, available: true, serviceIds: ['demo-fade', 'demo-beard'], location: { lat: 41.327, lng: 69.228 }, workPhoto: image('style-inspiration.png'), position: '0%' },
  { id: 'demo-barber-5', verification: { approvedByAdmin: true, trusted: true, skilled: true }, name: 'Dilshod Akramov', salonName: 'Kontur Barbershop', area: 'Yakkasaroy', address: 'Yakkasaroy tumani, Toshkent', region: 'Toshkent shahri', startingPrice: 90000, rating: 4.9, reviewCount: 21, available: false, serviceIds: ['demo-classic', 'demo-texture'], location: { lat: 41.276, lng: 69.251 }, workPhoto: image('style-inspiration.png'), position: '50%' },
];

export const sampleCustomers = [
  { id: 'demo-customer-1', firstName: 'Bekzod', lastName: 'Ismoilov', name: 'Bekzod Ismoilov', address: 'Chilonzor, Toshkent', location: { lat: 41.29, lng: 69.21 } },
  { id: 'demo-customer-2', firstName: 'Diyor', lastName: 'Saidov', name: 'Diyor Saidov', address: 'Yunusobod, Toshkent', location: { lat: 41.36, lng: 69.28 } },
  { id: 'demo-customer-3', firstName: 'Kamron', lastName: 'Sobirov', name: 'Kamron Sobirov', address: 'Mirobod, Toshkent', location: { lat: 41.29, lng: 69.27 } },
];

export const sampleServices = [
  { id: 'demo-fade', name: 'Fade soch olish', category: 'Soch olish', description: 'Silliq o‘tish va aniq kontur.', minPrice: 60000, maxPrice: 60000, duration: 45, barberIds: ['demo-barber-1', 'demo-barber-4'], salonIds: [] },
  { id: 'demo-texture', name: 'Teksturali soch olish', category: 'Soch olish', description: 'Tabiiy hajm va erkin turmak.', minPrice: 80000, maxPrice: 80000, duration: 60, barberIds: ['demo-barber-2', 'demo-barber-5'], salonIds: [] },
  { id: 'demo-classic', name: 'Klassik soch olish', category: 'Soch olish', description: 'Tartibli ajrim va yumshoq chiziqlar.', minPrice: 70000, maxPrice: 70000, duration: 45, barberIds: ['demo-barber-3', 'demo-barber-5'], salonIds: [] },
  { id: 'demo-beard', name: 'Soqolni tartibga keltirish', category: 'Soqol', description: 'Shakl berish va konturlarni tozalash.', minPrice: 30000, maxPrice: 30000, duration: 30, barberIds: sampleBarbers.map(({ id }) => id), salonIds: [] },
];

export const sampleBookings = [
  { id: 'demo-booking-1', customerId: 'demo-customer-1', barberId: 'demo-barber-1', serviceId: 'demo-fade', dayOffset: 0, time: '14:30', status: 'confirmed' },
  { id: 'demo-booking-2', customerId: 'demo-customer-2', barberId: 'demo-barber-1', serviceId: 'demo-beard', dayOffset: 1, time: '11:00', status: 'pending' },
  { id: 'demo-booking-3', customerId: 'demo-customer-3', barberId: 'demo-barber-2', serviceId: 'demo-texture', dayOffset: -2, time: '16:00', status: 'completed' },
  { id: 'demo-booking-4', customerId: 'demo-customer-1', barberId: 'demo-barber-3', serviceId: 'demo-classic', dayOffset: -7, time: '12:30', status: 'completed' },
];

export const sampleReviews = [
  { id: 'demo-review-1', customerId: 'demo-customer-1', barberId: 'demo-barber-1', rating: 5, text: 'Vaqtida boshladi, sochimni xohlaganimdek oldi.' },
  { id: 'demo-review-2', customerId: 'demo-customer-2', barberId: 'demo-barber-1', rating: 5, text: 'Ishi tartibli, keyingi safar ham shu ustaga boraman.' },
  { id: 'demo-review-3', customerId: 'demo-customer-3', barberId: 'demo-barber-2', rating: 4, text: 'Turmak va parvarish bo‘yicha yaxshi maslahat berdi.' },
];

export const sampleCatalog = { barbers: sampleBarbers, salons: [], services: sampleServices };

export async function loadSampleCatalog({ signal } = {}) {
  signal?.throwIfAborted();
  return sampleCatalog;
}

// Generated atlas: rows are haircuts; columns are front, side, and back views.
export const sampleHairAtlas = image('haircut-views.png');
export const sampleHairstyles = [
  { id: 'fade', name: 'Toza fade', row: 0, serviceId: 'demo-fade', description: 'Qisqa yonlar, silliq o‘tish va aniq kontur. Kundalik parvarishi oson.' },
  { id: 'texture', name: 'Tekstura', row: 1, serviceId: 'demo-texture', description: 'Tabiiy hajm va erkin turmak. Sochning tabiiy shaklini ochib beradi.' },
  { id: 'classic', name: 'Klassik', row: 2, serviceId: 'demo-classic', description: 'Tartibli ajrim va yumshoq chiziqlar. Har kuni uchun qulay ko‘rinish.' },
  { id: 'buzz', name: 'Buzz cut', atlas: image('haircuts-short.webp'), row: 0, serviceId: 'demo-fade', description: 'Bir tekis juda qisqa tepa va toza fade. Ixcham, qulay va kundalik turmaklashni talab qilmaydi.' },
  { id: 'french-crop', name: 'French crop', atlas: image('haircuts-short.webp'), row: 1, serviceId: 'demo-texture', description: 'Qisqa teksturali tepa va peshonaga tushgan tekis kokil. Yonlari toza, shakli aniq.' },
  { id: 'curly-taper', name: 'Jingalak taper', atlas: image('haircuts-short.webp'), row: 2, serviceId: 'demo-texture', description: 'Tabiiy jingalaklar tepada saqlanadi. Chakka va ensadagi yumshoq taper turmakka tartib beradi.' },
  { id: 'quiff', name: 'Quiff', atlas: image('haircuts-long.webp'), row: 0, serviceId: 'demo-classic', description: 'Old qismi yuqoriga ko‘tarilgan hajmli turmak. Qisqa yonlar va orqaga yo‘naltirilgan tekstura.' },
  { id: 'curtains', name: 'Curtains', atlas: image('haircuts-long.webp'), row: 1, serviceId: 'demo-classic', description: 'O‘rtadan ajratilgan o‘rta uzunlikdagi soch. Yuzning ikki tomoniga tabiiy tushadigan yumshoq to‘lqinlar.' },
  { id: 'mullet', name: 'Modern mullet', atlas: image('haircuts-long.webp'), row: 2, serviceId: 'demo-texture', description: 'Qisqaroq yonlar, teksturali tepa va uzunroq ensa. Erkin xarakterli zamonaviy turmak.' },
];

const sampleWeekdays = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
const sampleAbout = [
  'Fade va qisqa soch turmaklari bilan ishlaydi. Soch shakli va kundalik parvarish bo‘yicha maslahat beradi.',
  'Tabiiy tekstura va zamonaviy turmaklarga e’tibor beradi. Soch uzunligi va shaklini birga tanlashingiz mumkin.',
  'Klassik turmak va soqolga shakl berish xizmatlarini taklif qiladi. Tartibli ajrim va yumshoq o‘tishlar bilan ishlaydi.',
  'Qisqa soch turmaklari va aniq konturlarni yoqtiradiganlar uchun. Fade hamda soqolni tartibga keltirish bilan shug‘ullanadi.',
  'Klassik va teksturali turmaklar bilan ishlaydi. Soch turiga mos shakl hamda parvarish usulini tanlashga yordam beradi.',
];

export const sampleBarberDetails = Object.fromEntries(sampleBarbers.map((barber, index) => {
  const style = sampleHairstyles.find((item) => barber.serviceIds.includes(item.serviceId));
  return [barber.id, {
    about: sampleAbout[index],
    experience: index + 3,
    busyRanges: [{ start: '11:00', end: '12:00' }, { start: '15:00', end: '15:45' }],
    services: sampleServices.filter((service) => barber.serviceIds.includes(service.id)).map((service) => ({
      id: service.id, name: service.name, duration: service.duration,
      price: service.category === 'Soqol' ? service.minPrice : barber.startingPrice,
    })),
    hours: sampleWeekdays.map((day, dayIndex) => ({ day, isOff: dayIndex === 6, start: index % 2 ? '10:00' : '09:00', end: dayIndex === 5 ? '18:00' : '20:00' })),
    posts: ['Old ko‘rinish', 'Yon ko‘rinish', 'Orqa ko‘rinish'].map((angle, column) => ({
      id: `${barber.id}-post-${column}`, image: sampleHairAtlas, row: style.row, column,
      caption: `${style.name}. ${angle}.`,
    })),
  }];
}));
