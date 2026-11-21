const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? "http://localhost:5000" : "")).replace(/\/+$/, "");
// Media endpointlari API serverga boradi; data/blob va tashqi manzillar saqlanadi.
export const resolveMediaUrl = value => typeof value === "string" && value.startsWith("/api/media/") ? `${API_BASE_URL}${value}` : value;
const TIMEOUT_MS = 15000;

export class ApiError extends Error {
  constructor(status, code, message, metadata = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    // Keep backend metadata separate so it cannot overwrite Error properties.
    this.metadata = metadata;
  }
}

// Paths are backend paths such as /api/barbers. Tokens are supplied by callers;
// this transport never reads storage or changes authentication state.
// Empty successful responses return null; non-JSON responses throw ApiError.
export async function request(method, path, { body, token, signal, rawBody = false } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
  try {
    const headers = { Accept: "application/json" };
    if (body !== undefined && !rawBody) headers["Content-Type"] = "application/json";
    if (rawBody) headers["Content-Type"] = "application/octet-stream";
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API_BASE_URL}/${path.replace(/^\/+/, "")}`, {
      method,
      headers,
      ...(body !== undefined ? { body: rawBody ? body : JSON.stringify(body) } : {}),
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    const text = await response.text();
    let data = null;
    if (text.trim()) {
      try { data = JSON.parse(text); } catch {
        // Never reflect an HTML error page or raw server response in a message.
        throw new ApiError(response.status, response.ok ? "invalid_response" : "http_error",
          "Serverdan JSON javob olinmadi.");
      }
    }
    if (!response.ok) {
      const details = data && typeof data === "object" && !Array.isArray(data) ? data : {};
      const { message, code, ...metadata } = details;
      if (response.status === 429) {
        const retryHeader = response.headers.get("Retry-After");
        const retrySeconds = retryHeader && /^\d+$/.test(retryHeader.trim())
          ? Number(retryHeader) : Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000);
        if (Number.isFinite(retrySeconds) && retrySeconds >= 0) {
          metadata.retryAfter = Math.max(Number.isFinite(metadata.retryAfter) ? metadata.retryAfter : 0, retrySeconds);
        }
      }
      throw new ApiError(response.status,
        typeof code === "string" && code ? code : "http_error",
        typeof message === "string" && message ? message : "So‘rov bajarilmadi. Qayta urinib ko‘ring.",
        metadata);
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) throw new ApiError(0, "request_timeout", "Serverdan javob kutish muddati tugadi.");
    if (signal?.aborted) throw new ApiError(0, "request_aborted", "So‘rov bekor qilindi.");
    throw new ApiError(0, "network_error", "Server bilan aloqa o‘rnatilmadi. Ulanishni tekshirib qayta urinib ko‘ring.");
  } finally { clearTimeout(timer); }
}
