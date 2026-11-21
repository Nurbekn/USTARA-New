// v133: Public profile preview is never an editor/draft endpoint.
// It opens the EXISTING public guest route only for an approved, current barber.
const MAX_ID = 2147483647;
export function verifiedPublicId(profile, session, status = "ready") {
  const id = profile?.id;
  return status === "ready" && Number.isInteger(id) && id > 0 && id <= MAX_ID
    && session?.role === "barber" && typeof session?.token === "string" && session.token.length > 0
    && session.profileId === id ? id : null;
}

const textPresent = (value) => typeof value === "string" && value.trim().length > 0;
const validPoint = (point) => point != null && typeof point === "object"
  && Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90
  && Number.isFinite(point.lng) && point.lng >= -180 && point.lng <= 180;

export function publicProfileChecklist(profile = {}, posts = [], errors = {}) {
  const failed = (key) => errors != null && Object.hasOwn(errors,key) && Boolean(errors[key]);
  const services = Array.isArray(profile.services) ? profile.services : [];
  const hours = Array.isArray(profile.hours) ? profile.hours : [];
  return [
    { key: "name", label: "Ism", ok: textPresent(profile.firstName), to: "/barber/profile" },
    { key: "about", label: "O‘zingiz haqingizda", ok: textPresent(profile.about), to: "/barber/profile" },
    { key: "address", label: "Salon manzili", ok: textPresent(profile.address), to: "/barber/profile" },
    { key: "map", label: "Xaritadagi joylashuv", ok: validPoint(profile.location), to: "/barber/profile" },
    { key: "services", label: "Faol xizmatlar", ok: failed("services") ? null : services.some(s => s && s.active === true && textPresent(s.name) && Number.isFinite(s.price) && s.price >= 0), to: "/barber/services" },
    { key: "hours", label: "Ish vaqti", ok: failed("hours") ? null : hours.some(h => h && h.isOff === false && /^([01]\d|2[0-3]):[0-5]\d$/.test(h.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(h.end) && h.end > h.start), to: "/barber/schedule" },
    { key: "portfolio", label: "Portfolio postlari", ok: failed("posts") ? null : Array.isArray(posts) && posts.some(p => Number.isInteger(p?.id) && p.id > 0), to: "/barber/portfolio" },
  ];
}

export function publicProfilePreview(profile, { session, status = "idle", posts = [], errors = {}, dirty = false } = {}) {
  const id = verifiedPublicId(profile,session,status);
  const checks = id == null ? [] : publicProfileChecklist(profile, posts, errors);
  const approved = id != null && profile.verification_status === "approved";
  let message;
  if (status === "loading" || status === "idle") message = "Profil ma’lumotlari yuklanmoqda.";
  else if (status !== "ready" || id == null) message = "Joriy sartarosh hisobini qayta tekshiring.";
  else if (!approved) message = "Profil hali ommaga tasdiqlanmagan. Avval tasdiqlash jarayonini yakunlang.";
  else message = "Faqat serverda saqlangan, ommaga ochiq ma’lumotlar ko‘rinadi.";
  return {
    url: approved ? `/barbers/${id}` : null,
    canOpen: approved,
    message,
    unsavedWarning: approved && dirty ? "Saqlanmagan tahrirlar ommaviy profilda hali ko‘rinmaydi." : null,
    checks,
    readyCount: checks.filter(item => item.ok === true).length,
    unknownCount: checks.filter(item => item.ok == null).length,
  };
}
