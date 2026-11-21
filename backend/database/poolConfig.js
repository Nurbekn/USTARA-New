const { isIP } = require("node:net");

const TEST_DATABASE = "ustara_test_db";
const TEST_SCHEMA_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function fail(message) {
  throw new Error(message);
}

function normalizeHost(host) {
  return String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
}

function isLoopbackAddress(host) {
  const value = normalizeHost(host);
  if (value === "::1") return true;
  if (isIP(value) !== 4) return false;
  const octets = value.split(".").map(Number);
  return octets[0] === 127;
}

function validateLocalTestUrl(value, label = "Test database") {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} URL noto'g'ri formatda`);
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) fail(`${label} PostgreSQL URL bo'lishi kerak`);

  let database;
  try {
    database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  } catch {
    fail(`${label} database nomi noto'g'ri`);
  }
  if (database !== TEST_DATABASE) fail(`${label} faqat ${TEST_DATABASE} bazasidan foydalanishi mumkin`);
  if (!url.username) fail(`${label} session user ko'rsatilishi kerak`);

  const queryHosts = url.searchParams.getAll("host");
  const queryPorts = url.searchParams.getAll("port");
  const hostAddresses = url.searchParams.getAll("hostaddr");
  if (queryHosts.length > 1 || queryPorts.length > 1 || hostAddresses.length > 1
      || url.searchParams.has("service") || url.searchParams.has("options")) {
    fail(`${label} ulanish parametrlari noaniq yoki ruxsat etilmagan`);
  }
  const uriHost = normalizeHost(url.hostname);
  const queryHost = queryHosts[0] || "";
  const normalizedQueryHost = normalizeHost(queryHost);
  const socketHost = queryHost.startsWith("/");
  if (socketHost) {
    if (uriHost && !LOOPBACK_HOSTS.has(uriHost) && !isLoopbackAddress(uriHost)) {
      fail(`${label} faqat local host yoki Unix socketdan foydalanishi mumkin`);
    }
  } else if (queryHost) {
    if (uriHost && normalizedQueryHost !== uriHost) fail(`${label} host qiymatlari mos emas`);
    if (!LOOPBACK_HOSTS.has(normalizedQueryHost) && !isLoopbackAddress(normalizedQueryHost)) {
      fail(`${label} faqat local host yoki Unix socketdan foydalanishi mumkin`);
    }
  } else if (!LOOPBACK_HOSTS.has(uriHost) && !isLoopbackAddress(uriHost)) {
    fail(`${label} faqat local host yoki Unix socketdan foydalanishi mumkin`);
  }
  if (hostAddresses.length) {
    if (socketHost || !hostAddresses[0] || !isLoopbackAddress(hostAddresses[0])) {
      fail(`${label} hostaddr local test host bo'lishi kerak`);
    }
  }

  const port = queryPorts[0] || url.port;
  if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) {
    fail(`${label} porti noto'g'ri`);
  }
  if (queryPorts[0] && url.port && Number(queryPorts[0]) !== Number(url.port)) {
    fail(`${label} port qiymatlari mos emas`);
  }
  return {
    url,
    database,
    sessionUser: decodeURIComponent(url.username),
    host: socketHost ? queryHost : (normalizedQueryHost || uriHost),
    port: port ? Number(port) : 5432,
  };
}

function validateTestSearchPath(value) {
  if (!TEST_SCHEMA_PATTERN.test(value)) fail("USTARA_TEST_SEARCH_PATH schema nomi noto'g'ri");
  return value;
}

function createPoolConfig(env = process.env) {
  const testVariables = Object.keys(env).filter((key) => key.startsWith("USTARA_TEST_"));
  const nodeEnvironment = env.NODE_ENV || "development";
  if (nodeEnvironment !== "test" && nodeEnvironment !== "development" && testVariables.length) {
    fail("USTARA_TEST_* sozlamalari faqat NODE_ENV=test muhitida ruxsat etiladi");
  }

  if (nodeEnvironment === "test") {
    if (env.USTARA_TEST_USE_APP_DATABASE_URL !== undefined
        && !["0", "1"].includes(env.USTARA_TEST_USE_APP_DATABASE_URL)) {
      fail("USTARA_TEST_USE_APP_DATABASE_URL qiymati noto'g'ri");
    }
    const useAppUrl = env.USTARA_TEST_USE_APP_DATABASE_URL === "1";
    const connectionString = useAppUrl
      ? (env.USTARA_TEST_APP_DATABASE_URL || env.USTARA_TEST_DATABASE_URL)
      : env.USTARA_TEST_DATABASE_URL;
    if (!connectionString) fail("Izolyatsiyalangan test database URL talab qilinadi");
    validateLocalTestUrl(connectionString);
    const config = { connectionString, ssl: false };
    if (env.USTARA_TEST_SEARCH_PATH !== undefined) {
      const schema = validateTestSearchPath(env.USTARA_TEST_SEARCH_PATH);
      config.options = `-c search_path=${schema}`;
    }
    return config;
  }

  const required = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"];
  if (required.some((key) => !env[key])) fail("Production database konfiguratsiyasi to'liq emas");
  if (/^ustara_test_/i.test(env.DB_NAME)) fail("Production database nomi test bazasi bo'lishi mumkin emas");
  if (!/^\d+$/.test(String(env.DB_PORT)) || Number(env.DB_PORT) < 1 || Number(env.DB_PORT) > 65535) {
    fail("Production database porti noto'g'ri");
  }
  if (env.NODE_ENV === "production" && env.DB_HOST.startsWith("/")) {
    fail("Production database TLS uchun TCP host talab qilinadi");
  }
  const localHost = env.DB_HOST.startsWith("/") || LOOPBACK_HOSTS.has(normalizeHost(env.DB_HOST))
    || isLoopbackAddress(env.DB_HOST);
  const ssl = env.NODE_ENV === "production" || !localHost
    ? { rejectUnauthorized: true, ...(env.DB_SSL_CA ? { ca: env.DB_SSL_CA } : {}) }
    : false;
  return {
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl,
  };
}

module.exports = {
  TEST_DATABASE,
  createPoolConfig,
  validateLocalTestUrl,
  validateTestSearchPath,
};
