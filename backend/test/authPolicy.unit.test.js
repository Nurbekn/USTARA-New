const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { normalizePhone } = require("../utils/registration");
const { validateRegistrationPassword } = require("../utils/passwordPolicy");

const frontendRoot = path.resolve(__dirname, "../../frontend/src/pages/auth/utils");
const loadFrontend = (name) => import(pathToFileURL(path.join(frontendRoot, name)).href);

test("frontend and backend use the same phone normalization and registration password rules", async () => {
  const [phonePolicy, passwordPolicy] = await Promise.all([
    loadFrontend("phone.js"), loadFrontend("passwordPolicy.js"),
  ]);
  const phones = ["90 123-45-67", "998901234567", "+998 (90) 123-45-67", "00998901234567", "+1 (202) 555-0100"];
  for (const raw of phones) assert.equal(phonePolicy.normalizePhone(raw), normalizePhone(raw));
  for (const raw of [null, "abc901234567", "++998901234567", "+012345678", "1".repeat(61)]) {
    assert.throws(() => phonePolicy.normalizePhone(raw));
    assert.throws(() => normalizePhone(raw));
  }

  const valid128 = `Abcdefg${"1".repeat(121)}`;
  const passwords = ["Abcdef12", valid128, `Abcdefg${"1".repeat(122)}`, "987654321", "Password", "qwerty123", "Aa123456"];
  for (const weak of passwordPolicy.COMMON_PASSWORDS) passwords.push(weak);
  for (const password of passwords) {
    assert.equal(passwordPolicy.passwordError(password) === "", validateRegistrationPassword(password) === null,
      "frontend and backend password acceptance should match");
  }
  assert.equal(passwordPolicy.PASSWORD_MAX_LENGTH, 128);
});

test("canonical schema and migrations enforce database-level unique users.phone", () => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../database/schema.sql"), "utf8");
  const foundation = fs.readFileSync(path.resolve(__dirname, "../database/migrations/20261113_00_users_foundation.sql"), "utf8");
  const unified = fs.readFileSync(path.resolve(__dirname, "../database/migrations/20261113_unified_accounts.sql"), "utf8");
  assert.match(schema, /phone\s+VARCHAR\(20\)\s+NOT NULL\s+UNIQUE/i);
  assert.match(foundation, /phone\s+VARCHAR\(20\)\s+NOT NULL\s+UNIQUE/i);
  assert.match(unified, /CREATE UNIQUE INDEX users_phone_unique ON %I\.users\(phone\)/);
  assert.match(unified, /users\.phone UNIQUE indeksi yoki cheklovi yo''q/);
});
