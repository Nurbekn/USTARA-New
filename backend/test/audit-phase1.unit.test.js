"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { auditProject } = require("../scripts/audit-phase1");

test("offline project audit indexes 185 decisions and validates bootstrap includes", () => {
  assert.deepEqual(auditProject(), { decisionCount: 185, migrationCount: 63, checkedFiles: 13 });
});
