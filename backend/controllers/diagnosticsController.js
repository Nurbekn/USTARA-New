const pool = require("../db");

function allowLocalhostOnly(req, res, next) {
  const remoteAddress = req.socket?.remoteAddress;
  const isLocalAddress = remoteAddress === "127.0.0.1"
    || remoteAddress === "::1"
    || remoteAddress?.toLowerCase() === "::ffff:127.0.0.1";

  if (!isLocalAddress) {
    return res.status(403).json({ message: "Faqat localhost ulanishiga ruxsat berilgan" });
  }

  return next();
}

async function getDatabaseDiagnostics(req, res) {
  try {
    const result = await pool.query(`
      WITH requested_tables(table_name) AS (
        VALUES
          ('users'),
          ('customers'),
          ('barbers'),
          ('services'),
          ('bookings'),
          ('admin_accounts')
      ), table_presence AS (
        SELECT requested.table_name,
               COALESCE(
                 array_agg(found.table_schema ORDER BY found.table_schema)
                   FILTER (WHERE found.table_schema IS NOT NULL),
                 ARRAY[]::text[]
               ) AS schemas
        FROM requested_tables requested
        LEFT JOIN information_schema.tables found
          ON found.table_name = requested.table_name
         AND found.table_type = 'BASE TABLE'
        GROUP BY requested.table_name
      )
      SELECT current_database() AS database_name,
             current_schema() AS schema_name,
             current_user AS database_user,
             current_setting('search_path') AS search_path,
             COALESCE(
               (
                 SELECT jsonb_object_agg(
                   table_name,
                   jsonb_build_object(
                     'exists', cardinality(schemas) > 0,
                     'schemas', to_jsonb(schemas),
                     'inCurrentSchema', current_schema() = ANY(schemas)
                   )
                 )
                 FROM table_presence
               ),
               '{}'::jsonb
             ) AS tables
    `);

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Database diagnostikasi so'rovi bajarilmadi");
    return res.status(500).json({ message: "Database diagnostikasini bajarib bo'lmadi" });
  }
}

module.exports = { allowLocalhostOnly, getDatabaseDiagnostics };
