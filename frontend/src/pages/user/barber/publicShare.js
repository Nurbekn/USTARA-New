// v134: Public-only canonical share links. Never copy auth state or current URL parameters.
const MAX_PUBLIC_ID = 2147483647;
const PUBLIC_TEXT_LIMIT = 90;
// The React router is deployed under Vite's BASE_URL (for example /USTARA-New/).
// Only a literal, slash-delimited deployment prefix is allowed: never reuse a
// current pathname, query string, encoded path segment or booking URL.
export function publicAppBasePath(basePath = "/") {
  if (typeof basePath !== "string" || basePath.length > 160
    || !/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(basePath)) return null;
  return basePath === "/" ? "" : basePath.slice(0, -1);
}
export function canonicalPublicBarberUrl(id, origin, basePath = "/") {
  if (!Number.isInteger(id) || id < 1 || id > MAX_PUBLIC_ID || typeof origin !== "string") return null;
  let parsed;
  try { parsed = new URL(origin); } catch { return null; }
  const localDev = parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (!(parsed.protocol === "https:" || localDev) || parsed.username || parsed.password
    || parsed.pathname !== "/" || parsed.search || parsed.hash || !parsed.host) return null;
  const prefix = publicAppBasePath(basePath);
  if (prefix === null) return null;
  return `${parsed.origin}${prefix}/barbers/${id}`;
}

// Match the backend's preview sanitization: no bidi overrides, controls or
// broken surrogate pairs when a Web Share client renders untrusted profile text.
const text = (value) => typeof value === "string"
  ? Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
      .replace(/\s+/g, " ").trim()).slice(0, PUBLIC_TEXT_LIMIT).join("") : "";
// A separate bot-readable backend origin may be enabled at deployment. Without it
// the v134 direct React link remains, but messaging previews are not guaranteed.
export function publicProfilePreviewUrl(id, previewOrigin) {
  if (typeof previewOrigin !== "string" || !previewOrigin || !canonicalPublicBarberUrl(id, previewOrigin)) return null;
  return `${previewOrigin}/share/barbers/${id}`;
}
export function publicBarberShareData(barber, origin, previewOrigin = "", basePath = "/") {
  if (!barber || typeof barber !== "object") return null;
  const url = previewOrigin ? publicProfilePreviewUrl(barber.id, previewOrigin) : canonicalPublicBarberUrl(barber.id, origin, basePath);
  if (!url) return null;
  const name = [text(barber.first_name ?? barber.firstName), text(barber.last_name ?? barber.lastName)].filter(Boolean).join(" ") || "Sartarosh";
  const salon = text(barber.salon_name ?? barber.salonName);
  const specialty = text(barber.specialty);
  // Only published identity metadata. Do not ever serialize a phone, customer, token, booking or draft.
  return { title: salon ? `${name} — ${salon}` : name, text: specialty ? `${specialty} • USTARA ommaviy profil` : "USTARA ommaviy profil", url };
}

export async function sharePublicBarberProfile(barber, origin, nav = {}, previewOrigin = "", basePath = "/") {
  const data = publicBarberShareData(barber, origin, previewOrigin, basePath);
  if (!data) return { status: "unavailable", url: null };
  if (typeof nav?.share === "function") {
    try { await nav.share(data); return { status: "shared", url: data.url }; }
    catch (error) { if (error?.name === "AbortError") return { status: "cancelled", url: null }; }
  }
  if (typeof nav?.clipboard?.writeText === "function") {
    try { await nav.clipboard.writeText(data.url); return { status: "copied", url: data.url }; }
    catch { /* Some browsers require a permission grant. Provide a manual fallback. */ }
  }
  return { status: "manual", url: data.url };
}
