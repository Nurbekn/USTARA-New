"use strict";
// Offline structural audit only: no dotenv, database connection, network, or SQL execution.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const { readBootstrapPlan } = require("./bootstrap-plan");

function auditProject(baseDir = root) {
  const required = [
    "backend/server.js", "backend/db.js", "backend/routes/bookings.js",
    "backend/routes/auth.js", "backend/routes/social.js", "backend/telegram/worker.js",
    "backend/ai/router.js", "backend/package.json", "frontend/package.json",
    "frontend/src/App.jsx", "frontend/src/layouts/UserLayout.jsx",
    "frontend/src/layouts/BarberLayout.jsx", "docs/USTARA_185_NAZORAT.csv",
  ];
  for (const relative of required) {
    if (!fs.statSync(path.join(baseDir, relative), { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Project file missing: ${relative}`);
    }
  }
  const csv = fs.readFileSync(path.join(baseDir, "docs/USTARA_185_NAZORAT.csv"), "utf8").replace(/^\uFEFF/, "");
  const lines = csv.trimEnd().split(/\r?\n/);
  if (!lines[0].startsWith("raqam,qaror,asosiy_bosqich,holat,")) {
    throw new Error("Decision audit CSV header mismatch");
  }
  const ids = lines.slice(1).map(line => Number(/^([0-9]+),/.exec(line)?.[1]));
  if (ids.length !== 185 || ids.some((value, index) => value !== index + 1)) {
    throw new Error("Decision tracker must contain all numbered decisions 1..185 exactly once");
  }
  const migrations = readBootstrapPlan(path.join(baseDir, "backend/database"));
  const forwardMigrations = migrations.filter(({ file }) => file.startsWith("migrations/"));
  return { decisionCount: ids.length, migrationCount: forwardMigrations.length, checkedFiles: required.length };
}

if (require.main === module) {
  try {
    const result = auditProject();
    console.log(`USTARA phase 1: ${result.decisionCount} decisions indexed; ${result.migrationCount} forward migrations ordered; ${result.checkedFiles} project files found.`);
    console.log("Offline structural check complete; this is NOT a feature or database integration test.");
  } catch (error) {
    console.error(`Audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { auditProject };
