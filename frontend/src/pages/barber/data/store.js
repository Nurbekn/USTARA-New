// ==========================================================
// store.js — single source of truth for the whole barber panel
//
// Every barber page reads and writes through this file, so
// working hours, services and bookings are never duplicated
// or out of sync between pages.
//
// Today it persists to localStorage (mock). When the backend
// is ready, only the `load()` and `commit()` functions change
// (they will call fetch). The pages stay exactly the same.
// ==========================================================
import { useSyncExternalStore } from "react";

// "barber-profile" is the SAME key the onboarding page already uses,
// so profile, services, hours and location stay compatible.
const KEYS = {
  profile: "barber-profile",
  bookings: "barber-bookings",
  posts: "barber-posts",
  reviews: "barber-reviews",
};

// Booking statuses (match the backend enum + "absent" for no-shows)
export const STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  ABSENT: "absent", // customer did not come (3 times = blocked)
};

// ---------- Date helpers ----------

// Local "YYYY-MM-DD". Do NOT use toISOString() here: it converts to UTC,
// and in Uzbekistan (UTC+5) the date is wrong before 05:00 in the morning.
export const toISODate = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const addDays = (offset, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() + offset);
  return d;
};

// ---------- Defaults (mock data until the backend exists) ----------

// day: 0 = Sunday ... 6 = Saturday (same as Date.getDay())
const DEFAULT_HOURS = [1, 2, 3, 4, 5, 6, 0].map((day) => ({
  day,
  isOff: day === 0,
  start: "09:00",
  end: "20:00",
}));

const DEFAULT_PROFILE = {
  firstName: "Nurbek",
  lastName: "Karimov",
  phone: "+998 90 123 45 67",
  telegram: "nurbek_barber",
  salonName: "Nurbek Barber",
  address: "Toshkent, Chilonzor",
  location: { lat: 41.2754, lng: 69.2043 },
  experience: 3,
  about: "Professional sartarosh. Fade, klassik soch olish va soqol dizayni.",
  avatar: 1, // id of one of the built-in avatars (see avatars.jsx)
  isAvailable: true,
  services: [
    { id: 1, name: "Soch olish", price: 50000, duration: 45 },
    { id: 2, name: "Soqol olish", price: 30000, duration: 30 },
    { id: 3, name: "Soch + soqol", price: 70000, duration: 75 },
  ],
  hours: DEFAULT_HOURS,
};

const MOCK_NAMES = [
  "Jasur Karimov", "Aziz Toshev", "Bobur Rahimov", "Sardor Aliyev",
  "Dilshod Umarov", "Otabek Yusupov", "Sherzod Nazarov", "Akmal Ergashev",
  "Javohir Qodirov", "Humoyun Saidov", "Rustam Mirzayev", "Anvar Ismoilov",
];

const pad = (n) => String(n).padStart(2, "0");

// Small seeded random generator: same "random" data on every reload
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds one booking. Price/name are COPIED from the service at booking time,
// so changing a service price later never rewrites past earnings.
function makeBooking(id, rand, service, date, time, status) {
  const name = MOCK_NAMES[Math.floor(rand() * MOCK_NAMES.length)];
  const phone = `+99890${String(1000000 + Math.floor(rand() * 8999999))}`;
  return {
    id,
    customer: name,
    phone,
    serviceId: service.id,
    service: service.name,
    price: service.price,
    duration: service.duration,
    date,
    time,
    status,
  };
}

// 1 year of history (for earnings charts) + today / next days
function seedBookings(profile) {
  const rand = mulberry32(2026);
  const { services, hours } = profile;
  const list = [];
  let id = 1;

  // Past 365 days: only on working days, 0–4 bookings per day
  for (let offset = -365; offset < 0; offset++) {
    const date = addDays(offset);
    const dayHours = hours.find((h) => h.day === date.getDay());
    if (!dayHours || dayHours.isOff) continue;

    const count = Math.floor(rand() * 4) + (rand() < 0.5 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const hour = 9 + i * 2 + Math.floor(rand() * 2);
      const time = `${pad(hour)}:${rand() < 0.5 ? "00" : "30"}`;
      const service = services[Math.floor(rand() * services.length)];
      const r = rand();
      const status =
        r < 0.88 ? STATUS.COMPLETED : r < 0.95 ? STATUS.CANCELLED : STATUS.ABSENT;
      list.push(makeBooking(id++, rand, service, toISODate(date), time, status));
    }
  }

  // Today and the next two days (what the dashboard shows)
  const upcoming = [
    [0, "09:30", STATUS.COMPLETED],
    [0, "12:30", STATUS.CONFIRMED],
    [0, "15:00", STATUS.PENDING],
    [0, "17:30", STATUS.PENDING],
    [1, "10:30", STATUS.CONFIRMED],
    [1, "14:00", STATUS.PENDING],
    [2, "11:00", STATUS.PENDING],
  ];
  for (const [offset, time, status] of upcoming) {
    const service = services[Math.floor(rand() * services.length)];
    list.push(makeBooking(id++, rand, service, toISODate(addDays(offset)), time, status));
  }
  return list;
}

function seedReviews() {
  const items = [
    ["Jasur Karimov", 5, "Juda zo'r fade qildi, rahmat! Albatta yana kelaman.", 2],
    ["Aziz Toshev", 5, "Vaqtida boshladi, tez va toza ishlaydi.", 6],
    ["Bobur Rahimov", 4, "Yaxshi, faqat biroz kutishga to'g'ri keldi.", 11],
    ["Sardor Aliyev", 5, "Soqol dizayni a'lo darajada.", 19],
    ["Dilshod Umarov", 3, "Soch yaxshi, lekin xizmat biroz sekin bo'ldi.", 34],
    ["Otabek Yusupov", 5, "Do'stlarimga ham tavsiya qildim.", 52],
    ["Sherzod Nazarov", 4, "Narxiga arziydi, toza va qulay joy.", 80],
  ];
  return items.map(([customer, rating, text, daysAgo], i) => ({
    id: i + 1,
    customer,
    rating,
    text,
    date: toISODate(addDays(-daysAgo)),
    reply: "",
  }));
}

// ---------- Storage ----------

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // storage full or blocked
  }
}

function load() {
  const saved = read(KEYS.profile, null) ?? {};

  // `account: true` = created through the sign-up page (real, starts empty).
  // Without it we show demo data so the panel can be previewed.
  const isAccount = saved.account === true;

  const savedServices = Array.isArray(saved.services) ? saved.services : [];
  const profile = {
    ...DEFAULT_PROFILE,
    ...saved,
    // Guard against the old object format: hours must be an array
    hours: Array.isArray(saved.hours) ? saved.hours : DEFAULT_HOURS,
    services: isAccount || savedServices.length ? savedServices : DEFAULT_PROFILE.services,
  };

  return {
    profile,
    bookings: read(KEYS.bookings, null) ?? (isAccount ? [] : seedBookings(profile)),
    posts: read(KEYS.posts, []),
    reviews: read(KEYS.reviews, null) ?? (isAccount ? [] : seedReviews()),
  };
}

// ---------- Store (subscribe / snapshot) ----------

let state = load();
const listeners = new Set();

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => state;

// Saves the changed parts first. Returns false if saving failed
// (e.g. photos filled localStorage) and then leaves the state untouched.
function commit(patch) {
  for (const part of Object.keys(patch)) {
    if (!write(KEYS[part], patch[part])) return false;
  }
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
  return true;
}

// React hook: any component using it re-renders when data changes
export const useBarber = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

// ---------- Actions ----------

export const updateProfile = (patch) =>
  commit({ profile: { ...state.profile, ...patch } });

export const setBookingStatus = (id, status) =>
  commit({
    bookings: state.bookings.map((b) => (b.id === id ? { ...b, status } : b)),
  });

export const addPost = (post) =>
  commit({
    posts: [{ id: Date.now(), date: toISODate(), ...post }, ...state.posts],
  });

export const removePost = (id) =>
  commit({ posts: state.posts.filter((p) => p.id !== id) });

export const replyToReview = (id, reply) =>
  commit({
    reviews: state.reviews.map((r) => (r.id === id ? { ...r, reply } : r)),
  });

// Called right after a barber signs up: a clean account with NO services,
// bookings, posts or reviews (the barber adds services later in the panel).
export function createAccount(patch) {
  const profile = {
    ...DEFAULT_PROFILE,
    lastName: "",
    telegram: "",
    about: "",
    experience: 0,
    address: "",
    location: null,
    isAvailable: true,
    services: [],
    hours: DEFAULT_HOURS,
    ...patch,
    account: true,
  };
  const next = { profile, bookings: [], posts: [], reviews: [] };

  for (const part of Object.keys(next)) write(KEYS[part], next[part]);
  state = next;
  listeners.forEach((listener) => listener());
}

// ---------- Derived data (pure helpers) ----------

// Average rating + how many reviews per star (for the bar chart)
export function getRatingSummary(reviews) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const r of reviews) {
    distribution[r.rating] += 1;
    sum += r.rating;
  }
  return {
    count: reviews.length,
    average: reviews.length ? sum / reviews.length : 0,
    distribution,
  };
}
