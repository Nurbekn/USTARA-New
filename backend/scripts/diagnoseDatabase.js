const TABLES = ["users", "customers", "barbers", "services", "bookings", "admin_accounts"];

function safeCode(error) {
  return typeof error?.code === "string" && /^[A-Z0-9_]{1,32}$/.test(error.code)
    ? error.code
    : null;
}

function safeName(error) {
  return typeof error?.name === "string" && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(error.name)
    ? error.name
    : "OtherError";
}

function safeReason(code) {
  if (code === "ECONNREFUSED") return "Ulanish rad etildi";
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") return "Ulanish vaqti tugadi";
  if (code === "ENOTFOUND") return "Tarmoq manzilini aniqlab bo‘lmadi";
  if (code === "28P01" || code === "28000") return "Ma’lumotlar bazasi autentifikatsiyasi amalga oshmadi";
  if (code === "42501") return "Amal uchun ruxsat yo‘q";
  if (code === "42601") return "So‘rov sintaksisi xatosi";
  if (code === "42P01") return "So‘rovdagi jadval yoki obyekt topilmadi";
  if (code?.startsWith("08")) return "Ma’lumotlar bazasiga ulanish xatosi";
  return code ? "Xato kodi bo‘yicha umumiy tasnif mavjud emas" : "Xavfsiz xato kodi mavjud emas";
}

function reportFailure(stage, error) {
  const code = safeCode(error);
  console.error(JSON.stringify({
    stage,
    code,
    name: safeName(error),
    reason: safeReason(code),
  }));
  process.exitCode = 1;
}

async function main() {
  let pool;
  let client;
  let stage = "db_module_load";

  try {
    pool = require("../db");

    stage = "connection_acquire";
    client = await pool.connect();

    stage = "current_database";
    const databaseResult = await client.query("SELECT current_database() AS database_name");

    stage = "search_path";
    const searchPathResult = await client.query("SHOW search_path");

    stage = "tables_information_schema";
    const tablesResult = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_type = 'BASE TABLE'
         AND table_name = ANY($1::text[])`,
      [TABLES],
    );

    const foundTables = new Set(tablesResult.rows.map((row) => row.table_name));
    console.log(JSON.stringify({
      database: databaseResult.rows[0]?.database_name ?? null,
      search_path: searchPathResult.rows[0]?.search_path ?? null,
      tables: Object.fromEntries(TABLES.map((table) => [table, foundTables.has(table)])),
    }));
  } catch (error) {
    reportFailure(stage, error);
  } finally {
    if (client) {
      try {
        client.release();
      } catch (error) {
        reportFailure("connection_release", error);
      }
    }

    if (pool && typeof pool.end === "function") {
      try {
        await pool.end();
      } catch (error) {
        reportFailure("pool_close", error);
      }
    }
  }
}

main();
