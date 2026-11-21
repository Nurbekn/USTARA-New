const {readTelegramRetryAfter}=require('../services/telegramRetryPolicy');
class TelegramApiError extends Error {
  constructor(code, retryAfter = 5) { super("Telegram API unavailable"); this.code = code; this.retryAfter = retryAfter; }
}
function chatIdentity(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  if (!['number', 'string'].includes(typeof value)) return null;
  const id = String(value);
  return /^-?[1-9]\d{0,18}$/.test(id) && BigInt(id) >= -9223372036854775808n
    && BigInt(id) <= 9223372036854775807n ? id : null;
}
function validateSentMessage(result, expectedChatId) {
  const expected = chatIdentity(expectedChatId);
  if (!Number.isSafeInteger(result?.message_id) || result.message_id <= 0
    || !expected || chatIdentity(result.chat?.id) !== expected) {
    throw new TelegramApiError('invalid_response');
  }
  return result;
}
function createTelegramApi(token, fetcher = fetch) {
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token || "")) throw new TelegramApiError("configuration");
  return async (method, body = {}, signal) => {
    if (!["getMe", "getWebhookInfo", "getUpdates", "sendMessage", "answerCallbackQuery", "editMessageReplyMarkup"].includes(method)) throw new TelegramApiError("method");
    try {
      const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(35000)]) : AbortSignal.timeout(35000),
        redirect: "error",
      });
      const data = await response.json();
      if (!response.ok || data?.ok !== true) {
        const code=data?.error_code || response.status;
        const raw=data?.parameters?.retry_after;
        // An HTTP 429 without retry_after is NOT evidence of a five-second
        // cooldown. All delivery workers and the poller fail closed on NaN.
        const wait=Number(code)===429 && (raw===undefined||raw===null)
          ? Number.NaN : readTelegramRetryAfter(raw);
        throw new TelegramApiError(code,wait);
      }
      return method === 'sendMessage' ? validateSentMessage(data.result, body.chat_id) : data.result;
    } catch (error) {
      if (error instanceof TelegramApiError) throw error;
      // Fetch errors can embed the URL containing the bot token. No cause/raw
      // description is propagated, printed or attached to this sanitized error.
      throw new TelegramApiError("transport");
    }
  };
}
module.exports = { createTelegramApi, TelegramApiError, validateSentMessage };
