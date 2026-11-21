const { fail, OTP_PATTERN } = require("../utils/registration");

const ESKIZ_API = "https://notify.eskiz.uz/api";
const REQUEST_TIMEOUT_MS = 10000;

// Deliberately no network, console output, retained OTPs or production fallback.
function createTestSmsAdapter(env = process.env) {
  function ready() {
    if (!["test", "development"].includes(env.NODE_ENV) || env.OTP_SMS_ADAPTER !== "test") {
      throw fail(503, "SMS xizmati sozlanmagan", "sms_unavailable");
    }
  }
  return {
    ready,
    async send() { ready(); },
    exposeCode() { return env.NODE_ENV === "test" && env.OTP_EXPOSE_CODE === "true"; },
  };
}

function createEskizSmsAdapter(env = process.env, fetchImpl = global.fetch, logger = console) {
  // Only fixed categories and HTTP status are logged; never provider payloads.
  function rejected(stage, status, message, reason = "provider_rejected") {
    logger.error("eskiz_sms_failed", { stage, status, reason });
    return fail(503, message, "sms_unavailable");
  }
  let tokenPromise;

  function configuration() {
    const template = env.ESKIZ_SMS_TEMPLATE;
    if (env.NODE_ENV === "test"
      || typeof env.ESKIZ_EMAIL !== "string" || !env.ESKIZ_EMAIL.trim()
      || typeof env.ESKIZ_PASSWORD !== "string" || !env.ESKIZ_PASSWORD
      || typeof env.ESKIZ_FROM !== "string" || !env.ESKIZ_FROM.trim()
      || typeof template !== "string" || !template.trim()
      || (template.match(/\{code\}/g) || []).length !== 1) {
      throw fail(503, "Eskiz SMS sozlamalari to'liq emas", "sms_unavailable");
    }
    return {
      email: env.ESKIZ_EMAIL.trim(),
      password: env.ESKIZ_PASSWORD,
      from: env.ESKIZ_FROM.trim(),
      template,
    };
  }

  async function post(path, body, token) {
    const response = await fetchImpl(`${ESKIZ_API}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    return { response, payload };
  }

  async function authenticate(config) {
    const { response, payload } = await post("/auth/login", {
      email: config.email,
      password: config.password,
    });
    if (!response.ok) throw rejected("authenticate", response.status, "Eskiz autentifikatsiyasi muvaffaqiyatsiz");
    const token = payload?.data?.token || payload?.token;
    if (typeof token !== "string" || !token) {
      throw rejected("authenticate", response.status, "Eskiz javobi yaroqsiz", "invalid_response");
    }
    return token;
  }

  function getToken(config) {
    if (!tokenPromise) {
      tokenPromise = authenticate(config).catch((error) => {
        tokenPromise = null;
        throw error;
      });
    }
    return tokenPromise;
  }

  async function sendWithToken(config, phone, code, token) {
    return post("/message/sms/send", {
      mobile_phone: phone.replace(/^\+/, ""),
      message: config.template.replace("{code}", code),
      from: config.from,
    }, token);
  }

  return {
    ready() { configuration(); },
    async send({ phone, code }) {
      const config = configuration();
      if (typeof fetchImpl !== "function" || !/^\+[1-9]\d{7,14}$/.test(phone)
        || typeof code !== "string" || !OTP_PATTERN.test(code)) {
        throw fail(503, "Eskiz SMS so'rovini tayyorlab bo'lmadi", "sms_unavailable");
      }
      let stage = "authenticate";
      try {
        let token = await getToken(config);
        stage = "send";
        let result = await sendWithToken(config, phone, code, token);
        if (result.response.status === 401) {
          tokenPromise = null;
          stage = "authenticate";
          token = await getToken(config);
          stage = "send";
          result = await sendWithToken(config, phone, code, token);
        }
        if (!result.response.ok || !result.payload) {
          throw rejected("send", result.response.status, "Eskiz SMS yuborishni rad etdi", result.payload ? "provider_rejected" : "invalid_response");
        }
      } catch (error) {
        if (error?.code === "sms_unavailable") throw error;
        // Provider responses and request data may contain credentials, phone or OTP.
        throw rejected(stage, null, "Eskiz SMS xizmatiga ulanib bo'lmadi",
          ["TimeoutError", "AbortError"].includes(error?.name) ? "timeout" : "network_error");
      }
    },
    exposeCode() { return false; },
  };
}

function createRegistrationSmsAdapter(env = process.env) {
  if (env.OTP_SMS_ADAPTER === "eskiz") return createEskizSmsAdapter(env);
  // Keep this indirect so local test harnesses can wrap the test adapter.
  return module.exports.createTestSmsAdapter(env);
}

module.exports = { createTestSmsAdapter, createEskizSmsAdapter, createRegistrationSmsAdapter };
