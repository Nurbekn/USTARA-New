"use strict";
// v135: crawler-readable public barber previews. All profile data comes from the
// same approved/deactivated-account guard as GET /api/barbers/:id.
const MAX_ID = 2147483647;
function safeId(raw) {
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isSafeInteger(number) && number <= MAX_ID ? number : null;
}
function validOrigin(raw, { allowDevelopmentHttp = false } = {}) {
  if (typeof raw !== "string" || !raw || raw.length > 300) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  const development = allowDevelopmentHttp && u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (!(u.protocol === "https:" || development) || !u.host || u.username || u.password
    || u.pathname !== "/" || u.search || u.hash || u.origin !== raw) return null;
  return u.origin;
}
function appBase(raw, options = {}) {
  if (typeof raw !== "string" || !raw || raw.length > 400 || /\/(?:\.|%2e){2}(?:\/|$)/i.test(raw)) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  const origin = validOrigin(u.origin, options);
  if (!origin || u.username || u.password || u.search || u.hash
    || /%2f|%5c|\\|\/\/{2}|\.\./i.test(u.pathname)) return null;
  const path = u.pathname.replace(/\/+$/, "");
  if (path && !/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+$/.test(path)) return null;
  return origin + path;
}
function text(value, max = 120) {
  if (typeof value !== "string") return "";
  const clean = value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim();
  return Array.from(clean).slice(0, max).join("");
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
function previewModel(barber, id, { previewOrigin, appUrlBase, allowDevelopmentHttp = false } = {}) {
  const pOrigin = validOrigin(previewOrigin, { allowDevelopmentHttp });
  const aBase = appBase(appUrlBase, { allowDevelopmentHttp });
  if (!id || !pOrigin || !aBase || !barber || Number(barber.id) !== id) return null;
  const person = [text(barber.first_name, 65), text(barber.last_name, 65)].filter(Boolean).join(" ");
  const salon = text(barber.salon_name, 80);
  const specialty = text(barber.specialty, 90);
  const title = [person || "Sartarosh", salon].filter(Boolean).join(" — ");
  const description = specialty ? `${specialty} — USTARA’da tasdiqlangan sartarosh profili.` : "USTARA’da tasdiqlangan sartarosh profili.";
  return {
    title, description,
    url: `${pOrigin}/share/barbers/${id}`,
    image: `${pOrigin}/share-assets/profile-preview.jpg`,
    imageAlt: "USTARA — sartarosh profili",
    appUrl: `${aBase}/barbers/${id}`,
  };
}
function renderPreviewHtml(model) {
  const { title, description, url, image, imageAlt, appUrl } = Object.fromEntries(Object.entries(model).map(([key, value]) => [key, escapeHtml(value)]));
  return `<!doctype html>\n<html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="referrer" content="no-referrer"><meta name="robots" content="index,follow">\n<title>${title} | USTARA</title>\n<meta name="description" content="${description}">\n<link rel="canonical" href="${url}">\n<meta property="og:type" content="profile"><meta property="og:locale" content="uz_UZ">\n<meta property="og:site_name" content="USTARA"><meta property="og:url" content="${url}">\n<meta property="og:title" content="${title}"><meta property="og:description" content="${description}">\n<meta property="og:image" content="${image}"><meta property="og:image:secure_url" content="${image}">
<meta property="og:image:type" content="image/jpeg"><meta property="og:image:alt" content="${imageAlt}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">\n<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}">\n<meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${image}"><meta name="twitter:image:alt" content="${imageAlt}">\n</head><body><main><h1>${title}</h1><p>${description}</p><p><a href="${appUrl}" rel="noreferrer">USTARA’da profilni ochish</a></p></main></body></html>`;
}
// Lookup must be the vetted, approved-only, active-user public profile query.
function createPublicPreviewHandler({ findPublic, previewOrigin, appUrlBase, allowDevelopmentHttp = false }) {
  if (typeof findPublic !== "function") throw new TypeError("Approved-profile lookup required");
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Robots-Tag", "noindex"); // promote ONLY after a current approved record is verified
    res.set("Content-Security-Policy", "default-src 'none'; style-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    const id = safeId(req.params?.id);
    if (!id || (req.originalUrl || "").includes("?")) return res.status(400).type("text/plain").send("Noto‘g‘ri profil havolasi");
    if (!validOrigin(previewOrigin, { allowDevelopmentHttp }) || !appBase(appUrlBase, { allowDevelopmentHttp })) {
      return res.status(503).type("text/plain").send("Ommaviy havola serveri sozlanmagan");
    }
    try {
      const barber = await findPublic(id);
      if (!barber) return res.status(404).type("text/plain").send("Tasdiqlangan profil topilmadi");
      const model = previewModel(barber, id, { previewOrigin, appUrlBase, allowDevelopmentHttp });
      if (!model) return res.status(404).type("text/plain").send("Tasdiqlangan profil topilmadi");
      res.set("X-Robots-Tag", "index,follow");
      return res.status(200).type("html").send(renderPreviewHtml(model));
    } catch {
      return res.status(503).type("text/plain").send("Profilni tekshirishda xatolik");
    }
  };
}
module.exports = { safeId, validOrigin, appBase, text, escapeHtml, previewModel, renderPreviewHtml, createPublicPreviewHandler };
