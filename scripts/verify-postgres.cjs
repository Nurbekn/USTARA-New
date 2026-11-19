#!/usr/bin/env node
const { Client } = require('../backend/node_modules/pg');
const url = process.env.TEST_DATABASE_URL;
if (!url) { console.error('TEST_DATABASE_URL must be set'); process.exit(2); }
(async () => {
  const db = new Client({ connectionString: url, connectionTimeoutMillis: 7000 });
  try {
    await db.connect();
    const result = await db.query('SELECT current_database() AS name, pg_is_in_recovery() AS replica');
    const info = result.rows[0];
    if (info.replica || !/(test|staging)/i.test(info.name)) {
      throw new Error('Only writable test/staging databases are allowed');
    }
    await db.query('BEGIN');
    try {
      await db.query('CREATE TEMP TABLE ustara_v66_check (id int primary key) ON COMMIT DROP');
      await db.query('INSERT INTO ustara_v66_check VALUES (1)');
      const check = await db.query('SELECT count(*)::int AS count FROM ustara_v66_check');
      if (check.rows[0].count !== 1) throw new Error('Read/write check failed');
    } finally { await db.query('ROLLBACK'); }
    console.log(JSON.stringify({ passed: true, database: info.name }));
  } catch (e) {
    console.error(JSON.stringify({ passed: false, error: e.message }));
    process.exitCode = 1;
  } finally { await db.end().catch(() => {}); }
})();
