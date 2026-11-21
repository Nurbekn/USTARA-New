import { registrationSession } from "./registration";
import { request } from "../../../api/client.js";
import { normalizePhone } from "./phone.js";

async function requestLogin(phone, password, signal, reactivate = false) {
  const data = await request("POST", "/api/auth/login", {
    body: { phone, password, ...(reactivate ? { reactivate: true } : {}) }, signal,
  });
  const role = data?.customer && !data?.barber ? "customer" : data?.barber && !data?.customer ? "barber" : null;
  const profile = data?.[role];
  if (typeof data?.token !== "string" || !Number.isInteger(profile?.id) || profile.id <= 0
    || profile.phone !== phone || ![profile.first_name, profile.last_name].every((name) => name === null || typeof name === "string")
    || (role === "barber" && !["pending", "approved", "rejected"].includes(data.verification_status))) {
    throw new Error("Serverdan kirish ma’lumotlari olinmadi.");
  }
  const session = registrationSession(data, { role });
  // Setup is a local UI step, not authorization. Login restores an existing
  // account directly to its panel; backend status still controls protected APIs.
  return { profile, session: { ...session, ...(role === "barber" ? { setupDone: true } : {}),
    profile: { id: profile.id, first_name: profile.first_name, last_name: profile.last_name, phone: profile.phone } } };
}

export async function login(phone, password, reactivate = false) {
  const canonicalPhone = normalizePhone(phone);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    return await requestLogin(canonicalPhone, password, controller.signal, reactivate);
  } catch (error) {
    let message;
    if (error.status === 401) message = "Telefon raqami yoki parol noto‘g‘ri. Qayta tekshiring.";
    else if (error.code === 'account_deactivated') message = 'Akkaunt vaqtincha faolsiz. Parol bilan qayta faollashtirishni tasdiqlang.';
    else if (error.status === 403 || error.status === 423) message = "Hisobga kirish cheklangan. Administratorga murojaat qiling.";
    else if (error.status === 429) {
      const seconds = error.metadata?.retryAfter;
      message = Number.isFinite(seconds) && seconds > 0
        ? `Urinishlar ko‘payib ketdi. ${Math.ceil(seconds)} soniyadan keyin qayta urinib ko‘ring.`
        : "Urinishlar ko‘payib ketdi. Biroz kutib qayta urinib ko‘ring.";
    }
    else if (error.status >= 400) message = "Kirish xizmati hozir ishlamayapti. Keyinroq qayta urinib ko‘ring.";
    else if (error.code === "invalid_response") message = "Serverdan kirish ma’lumotlari olinmadi.";
    else if (["network_error", "request_timeout", "request_aborted"].includes(error.code)
      || error instanceof TypeError || error.name === "AbortError") {
      message = "Server bilan aloqa o‘rnatilmadi. Ulanishni tekshirib, qayta urinib ko‘ring.";
    } else throw error;
    // Keep existing UI messages while retaining the backend error unchanged as
    // cause and its message explicitly for callers that need API diagnostics.
    throw Object.assign(new Error(message, { cause: error }), {
      status: error.status, code: error.code, backendMessage: error.message, metadata: error.metadata,
    });
  } finally { clearTimeout(timer); }
}
