const { Pool } = require("pg");
require("dotenv").config();
const { createPoolConfig } = require("./database/poolConfig");
const pool = new Pool(createPoolConfig(process.env));

pool.on("error", (error) => {
  console.error("PostgreSQL ulanishidagi xato, kod:", error.code || "unknown");
});

module.exports = pool;
