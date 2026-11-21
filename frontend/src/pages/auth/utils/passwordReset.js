import { request } from "../../../api/client.js";
export async function resetRequest(action, body) {
  try {
    const data = await request("POST", `/api/auth/password-reset/${action}`, { body });
    if (data === null) throw new Error("Serverdan javob olinmadi. Qayta urinib ko‘ring.");
    return data;
  } catch (error) {
    let message;
    if (["network_error", "request_timeout", "request_aborted"].includes(error.code)) {
      message = "Server bilan aloqa o‘rnatilmadi. Ulanishni tekshirib qayta urinib ko‘ring.";
    } else if (error.code === "invalid_response"
      || (error.code === "http_error" && error.message === "Serverdan JSON javob olinmadi.")) {
      message = "Serverdan javob olinmadi. Qayta urinib ko‘ring.";
    }
    const result = message ? Object.assign(new Error(message, { cause: error }), {
      status: error.status, code: error.code, metadata: error.metadata,
    }) : error;
    // Existing UI reads these fields directly; other backend metadata remains
    // available in ApiError.metadata without changing reset state or payloads.
    for (const field of ["retryAfter", "adminRequired", "blockedUntil", "attemptsRemaining"]) {
      result[field] = error.metadata?.[field];
    }
    throw result;
  }
}
export function resetError(error) {
  if (error.code === 'telegram_otp_unavailable') return 'Telegram orqali kod yuborish hali sozlanmagan. Administratorga murojaat qiling.';
  if (error.adminRequired) return "Parolni tiklash bloklangan. Administratorga murojaat qiling.";
  if (error.code === "reset_blocked") {
    const until = new Date(error.blockedUntil);
    return Number.isFinite(until.getTime()) ? `Parolni tiklash ${until.toLocaleString("uz-UZ")} gacha cheklangan.` : "Parolni tiklash vaqtincha cheklangan.";
  }
  if (error.code === "invalid_otp" && Number.isInteger(error.attemptsRemaining)) return `Kod noto‘g‘ri. ${error.attemptsRemaining} ta urinish qoldi.`;
  if (error.code === "resend_too_soon") return "Kod olish uchun 3 daqiqalik oraliq tugashini kuting.";
  return error.message || "So‘rov bajarilmadi. Qayta urinib ko‘ring.";
}
export function resetDeadlines(data) {
  const otpExpiresAt = Date.parse(data.otpExpiresAt), challengeExpiresAt = Date.parse(data.challengeExpiresAt);
  if (!Number.isFinite(otpExpiresAt) || !Number.isFinite(challengeExpiresAt)
    || !Number.isFinite(data.resendAfter) || data.resendAfter < 0) throw new Error("Serverdan kod muddati olinmadi.");
  return { otpExpiresAt, challengeExpiresAt, resendAt: Date.now() + data.resendAfter * 1000 };
}
export function validResetToken(value) { return typeof value === "string" && /^[0-9a-f]{64}$/.test(value); }
