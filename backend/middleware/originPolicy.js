// Browsers must not read the API from arbitrary sites. Server-to-server
// clients (no Origin header) are unaffected. No credentials/cookies are used.
function parseOrigins(value) {
  if (typeof value !== "string") return [];
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  return [...new Set(items.map((item) => {
    let url;
    try { url = new URL(item); } catch { throw new Error("Invalid CORS_ALLOWED_ORIGINS entry"); }
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash || url.origin !== item) {
      throw new Error("CORS_ALLOWED_ORIGINS must contain exact origins, not paths or wildcards");
    }
    return url.origin;
  }))];
}

function createOriginPolicy(env = process.env) {
  const production = env.NODE_ENV === "production";
  const allowed = parseOrigins(env.CORS_ALLOWED_ORIGINS);
  // Fail startup rather than accidentally running a production wildcard API.
  if (production && !allowed.length) {
    throw new Error("CORS_ALLOWED_ORIGINS must be configured in production");
  }
  const allow = (origin) => !origin || (!production && !allowed.length) || allowed.includes(origin);
  return {
    guard(req, res, next) {
      res.vary("Origin");
      if (!allow(req.headers.origin)) {
        return res.status(403).json({ code: "origin_forbidden", message: "Ushbu saytdan so‘rovga ruxsat yo‘q." });
      }
      next();
    },
    corsOptions: {
      origin(origin, callback) { callback(null, allow(origin) ? (origin || false) : false); },
      exposedHeaders: ["Retry-After"],
    },
  };
}

module.exports = { parseOrigins, createOriginPolicy };
