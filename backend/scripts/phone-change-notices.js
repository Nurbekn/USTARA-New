// Ishga tushiruvchi muhit sozlamalarini beradi; bu skript .env o‘qimaydi.
const { Pool } = require('pg');
const { createPoolConfig } = require('../database/poolConfig');
const { createPhoneChangeService } = require('../services/phoneChangeService');
async function main() {
  const pool = new Pool({ ...createPoolConfig(), max: 1, connectionTimeoutMillis: 5000 });
  pool.on('error', () => {});
  try { await createPhoneChangeService({ pool }).flushNotices(); }
  finally { await pool.end(); }
}
if (require.main === module) main().catch(() => {
  console.error('Telefon almashtirish bildirishnomalarini yuborib bo‘lmadi.');
  process.exitCode = 1;
});
module.exports = { main };
