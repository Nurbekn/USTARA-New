const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { notFound, errorHandler } = require("../middleware/errorHandler");

// Exercise Express and its real JSON parser without loading server.js, dotenv,
// database connections or production routes.
let server, baseUrl;
const privateDetail = "PRIVATE_SQL_TOKEN_PASSWORD";
before(async () => {
  const app = express();
  app.use(express.json());
  app.post("/parse", (req, res) => res.json({ ok: true }));
  app.get("/unexpected", async () => {
    const error = new Error(privateDetail);
    error.detail = "SELECT password FROM users";
    error.stack = `Error: ${privateDetail}\n    at privateFunction (/private/server.js:1:1)`;
    throw error;
  });
  app.use(notFound);
  app.use(errorHandler);
  await new Promise((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve());
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server?.listening) await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
});

async function checkResponse(response, status, body) {
  assert.equal(response.status, status);
  assert.match(response.headers.get("content-type"), /^application\/json\b/);
  const text = await response.text();
  assert.deepEqual(JSON.parse(text), body);
  assert.doesNotMatch(text, /PRIVATE_SQL_TOKEN_PASSWORD|SELECT password|privateFunction|\/private\/server|"stack"|"detail"|"body"/);
}

test("unknown GET endpoint returns safe 404 JSON", async () => {
  await checkResponse(await fetch(`${baseUrl}/missing/${privateDetail}`), 404,
    { message: "Endpoint topilmadi", code: "not_found" });
});

test("malformed JSON returns safe 400 JSON without reflecting its body", async () => {
  await checkResponse(await fetch(`${baseUrl}/parse`, { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: `{"password":"${privateDetail}",` }), 400,
  { message: "JSON formati noto'g'ri", code: "invalid_json" });
});

test("unexpected async error returns safe 500 JSON without stack or SQL details", async () => {
  await checkResponse(await fetch(`${baseUrl}/unexpected`), 500,
    { message: "Serverda xatolik yuz berdi", code: "internal_error" });
});
