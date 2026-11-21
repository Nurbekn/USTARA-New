import { useEffect, useSyncExternalStore } from "react";
import { request, resolveMediaUrl } from "../../../api/client.js";
import { getSession } from "../../auth/utils/session.js";
import { parseCheckIn } from "../../user/bookings/checkInV170.js";

export const STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  REJECTED: "rejected",
};

export const toISODate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
};
export const addDays = (offset, from = new Date()) => {
  const date = new Date(from);
  date.setDate(date.getDate() + offset);
  return date;
};

const emptyHours = () => Array.from({ length: 7 }, (_, day) => ({
  day, isOff: true, start: "09:00", end: "18:00",
}));
const emptyProfile = () => ({
  id: null, firstName: "", lastName: "", phone: "", specialty: "",
  salonName: "", telegram: "", experience: null, about: "", certificates: [], address: "",
  location: null, avatar: null, avatarPhoto: "", isAvailable: null, followers: 0, following: 0,
  acceptingBookings: null,
  services: [], hours: emptyHours(), verification_status: "pending",
});

let state = { status: "idle", error: "", profile: emptyProfile(), bookings: [], reviews: [], posts: [] };
const listeners = new Set();
let requestInFlight;
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const getSnapshot = () => state;
function publish(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function bookingView(row) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(row.booking_time));
  const fields = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    id: row.id,
    customer: [row.customer_first_name, row.customer_last_name].filter(Boolean).join(" ") || "Mijoz",
    // The API exposes this only to the barber who owns the booking.
    phone: row.customer_phone || "",
    serviceId: row.service_id,
    service: row.services?.length ? row.services.map(item => item.name).join(" + ") : row.service_name || "Xizmat",
    services: row.services || [],
    // Booking list API exposes service name and duration, not its current price.
    price: row.total_price == null ? null : Number(row.total_price),
    duration: row.duration_minutes,
    bookingTime: row.booking_time,
    checkIn: parseCheckIn(row.check_in),
    lateNotice: row.late_notice && [5,10,15,20,30].includes(Number(row.late_notice.minutes))
      && Number.isFinite(Date.parse(row.late_notice.reportedAt))
      ? { minutes: Number(row.late_notice.minutes), reportedAt: row.late_notice.reportedAt } : null,
    date: `${fields.year}-${fields.month}-${fields.day}`,
    time: `${fields.hour}:${fields.minute}`,
    status: row.status,
  };
}

function profileView(barber, session = getSession()) {
  const location = Number.isFinite(barber.latitude) && Number.isFinite(barber.longitude)
    ? { lat: barber.latitude, lng: barber.longitude } : null;
  return {
    ...emptyProfile(),
    id: barber.id,
    firstName: barber.first_name || "",
    lastName: barber.last_name || "",
    phone: barber.phone || session?.phone || "",
    specialty: barber.specialty || "",
    salonName: barber.salon_name || "",
    address: barber.address || "",
    location,
    experience: barber.experience_years ?? null,
    about: barber.bio || "",
    certificates: Array.isArray(barber.certificates) ? barber.certificates : [],
    avatarPhoto: barber.avatar_url || "",
    isAvailable: barber.accepting_bookings,
    acceptingBookings: barber.accepting_bookings,
    verification_status: barber.verification_status,
  };
}

export async function refreshBarberData({ signal } = {}) {
  const session = getSession();
  if (session?.role !== "barber" || !session.token) {
    publish({ status: "error", error: "Sartarosh hisobi orqali qayta kiring." });
    return;
  }
  if (requestInFlight) return requestInFlight;
  publish({ status: "loading", error: "" });
  requestInFlight = (async () => {
    try {
      const profileResult = await request("GET", "/api/barbers/me", { token: session.token, signal });
      const barber = profileResult?.barber;
      if (!barber || barber.id !== session.profileId) throw new Error("Sartarosh profili olinmadi.");
      const paths = ["/api/bookings", `/api/services?barber_id=${barber.id}`, "/api/barbers/working-hours", "/api/barbers/reviews/me", "/api/barbers/me/portfolio"];
      const names = ["bookings", "services", "hours", "reviews", "posts"];
      const results = await Promise.allSettled(paths.map(path => request("GET", path, { token: session.token, signal })));
      const errors = {};
      const values = results.map((item, index) => {
        const value = item.status === "fulfilled" ? item.value : null;
        const valid = index < 3 ? Array.isArray(value) : Array.isArray(value?.[index === 3 ? "reviews" : "posts"]);
        if (!valid) errors[names[index]] = item.reason?.message || "Ma’lumot yuklanmadi. Qayta urinib ko‘ring.";
        return valid ? value : index < 3 ? [] : index === 3 ? { reviews: [] } : { posts: [] };
      });
      if (signal?.aborted || getSession()?.token !== session.token) return false;
      const [bookingRows, services, workingHours, reviewResult, portfolioResult] = values;
      const sameAccount = state.profile.id === barber.id;
      const hours = emptyHours();
      for (const item of workingHours) {
        if (Number.isInteger(item.day_of_week) && hours[item.day_of_week]) {
          hours[item.day_of_week] = {
            day: item.day_of_week, isOff: false,
            start: String(item.start_time).slice(0, 5), end: String(item.end_time).slice(0, 5),
          };
        }
      }
      publish({
        status: "ready", error: "", errors,
        profile: {
          ...profileView(barber, session),
          followers: portfolioResult.followerCount ?? state.profile.followers ?? 0,
          following: portfolioResult.followingCount ?? state.profile.following ?? 0,
          services: errors.services && sameAccount ? state.profile.services : services.map((service) => ({
            id: service.id, name: service.name, price: Number(service.price),
            duration: service.duration_minutes, active: service.is_active !== false,
          })), hours: errors.hours && sameAccount ? state.profile.hours : hours,
        },
        bookings: errors.bookings && sameAccount ? state.bookings : bookingRows.map(bookingView),
        reviews: errors.reviews && sameAccount ? state.reviews : reviewResult.reviews.map((review) => ({
          id: review.id, bookingId: review.bookingId, customer: review.customer,
          rating: review.rating, text: review.text, reply: review.reply,
          date: review.date,
        })),
        posts: errors.posts && sameAccount ? state.posts : portfolioResult.posts.map((post) => ({
          id: post.id, caption: post.caption, date: post.createdAt, featured: post.featured === true,
          mediaType: post.media?.[0]?.type || "image", image: resolveMediaUrl(post.media?.[0]?.url || ""),
          mediaUrl: post.media?.[0]?.type === "video" ? resolveMediaUrl(post.media?.[0]?.url) : "",
          media: post.media, service: services.find((service) => String(service.id) === String(post.serviceIds?.[0]))?.name || "",
          likeCount: post.likeCount, commentCount: post.commentCount, likedByMe: post.likedByMe, saved: post.saved,
        })),
      });
      return true;
    } catch (error) {
      if (signal?.aborted) return;
      publish({ status: "error", error: error.message || "Sartarosh ma’lumotlarini yuklab bo‘lmadi." });
      return false;
    } finally {
      requestInFlight = null;
    }
  })();
  return requestInFlight;
}

export function useBarber() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (state.status === "idle") void refreshBarberData();
  }, []);
  return snapshot;
}

export async function updateProfile(patch) {
  const fields = {
    firstName: "first_name", lastName: "last_name", salonName: "salon_name",
    address: "address", experience: "experience_years", about: "bio", certificates: "certificates",
    avatarPhoto: "avatar_url", location: "location",
  };
  const unsupported = Object.keys(patch).filter((key) => !Object.hasOwn(fields, key));
  if (unsupported.length) throw new Error("Bu profil maydonlarini saqlash API hozircha mavjud emas.");
  const session = getSession();
  if (session?.role !== "barber" || !state.profile.id) throw new Error("Sartarosh sessiyasi topilmadi.");
  const body = {};
  for (const [field, apiField] of Object.entries(fields)) {
    if (!Object.hasOwn(patch, field)) continue;
    const value = patch[field];
    if (field === "location") body.location = value === null ? null : value && { lat: value.lat, lng: value.lng };
    else if (field === "experience") body[apiField] = value === "" || value == null ? null : Number(value);
    else body[apiField] = value;
  }
  const result = await request("PUT", `/api/barbers/${state.profile.id}`, {
    token: session.token,
    body,
  });
  if (!result?.data || result.data.id !== state.profile.id
    || typeof result.data.first_name !== "string" || typeof result.data.last_name !== "string") {
    throw new Error("Profil yangilangani server tomonidan tasdiqlanmadi.");
  }
  publish({ profile: { ...state.profile, ...profileView(result.data, session), services: state.profile.services, hours: state.profile.hours } });
  return state.profile;
}

export async function saveWorkingHours(hours) {
  const session = getSession();
  if (session?.role !== "barber") throw new Error("Sartarosh sessiyasi topilmadi.");
  const working_hours = hours.filter((item) => !item.isOff).map((item) => ({
    day_of_week: item.day, start_time: item.start, end_time: item.end,
  }));
  if (!working_hours.length) throw new Error("Kamida bitta ish kunini tanlang.");
  await request("PUT", "/api/barbers/working-hours", { token: session.token, body: { working_hours } });
  if (!(await refreshBarberData()) || state.errors?.hours) throw new Error("Jadval saqlandi, ammo serverdan yangilangan ma’lumotlar olinmadi.");
  return true;
}

export async function setBookingAcceptance(acceptingBookings) {
  if (typeof acceptingBookings !== "boolean") throw new Error("Bron qabul qilish holati noto‘g‘ri.");
  const session = getSession();
  if (session?.role !== "barber" || !state.profile.id) throw new Error("Sartarosh sessiyasi topilmadi.");
  const result = await request("PUT", "/api/barbers/booking-acceptance", {
    token: session.token,
    body: { accepting_bookings: acceptingBookings },
  });
  if (result?.data?.accepting_bookings !== acceptingBookings) {
    throw new Error("Server bron qabul qilish holatini tasdiqlamadi.");
  }
  publish({ profile: { ...state.profile, acceptingBookings } });
  return acceptingBookings;
}

export async function setBookingStatus(id, status) {
  const session = getSession();
  if (session?.role !== "barber") throw new Error("Sartarosh sessiyasi topilmadi.");
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0 || !Object.hasOwn(STATUS, status.toUpperCase())) {
    throw new Error("Bron ID yoki yangi holat noto‘g‘ri.");
  }
  const result = await request("PUT", `/api/bookings/${id}`, { token: session.token, body: { status } });
  if (result?.data?.id !== Number(id) || result.data.status !== status) {
    throw new Error("Server bron holati yangilanganini tasdiqlamadi.");
  }
  if (!(await refreshBarberData())) throw new Error("Holat saqlandi, ammo bronlar ro‘yxati yangilanmadi.");
}

export function patchPortfolioPost(id, patch) {
  const allowed = Object.fromEntries(Object.entries(patch).filter(([key]) => ['likedByMe','saved','likeCount','commentCount'].includes(key)));
  publish({ posts: state.posts.map(post => String(post.id) === String(id) ? { ...post, ...allowed } : post) });
}

export function getRatingSummary(reviews = state.reviews) {
  const distribution = Object.fromEntries([1, 2, 3, 4, 5].map((rating) => [rating, reviews.filter((review) => review.rating === rating).length]));
  const count = reviews.length;
  return { count, average: count ? reviews.reduce((sum, review) => sum + review.rating, 0) / count : 0, distribution };
}

export async function replyToReview(id, text) {
  const session = getSession();
  if (session?.role !== "barber") throw new Error("Sartarosh sessiyasi topilmadi.");
  const result = await request("PUT", `/api/barbers/reviews/${encodeURIComponent(id)}/reply`, {
    token: session.token, body: { text },
  });
  const review = result?.review;
  if (!review || String(review.id) !== String(id) || review.reply !== text.trim()) {
    throw new Error("Server javobni saqlaganini tasdiqlamadi.");
  }
  publish({ reviews: state.reviews.map((item) => String(item.id) === String(id) ? { ...item, reply: review.reply } : item) });
  return review;
}
