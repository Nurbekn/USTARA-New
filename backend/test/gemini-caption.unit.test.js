"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createGeminiCaption } = require("../ai/geminiCaption");
// The real auth middleware is not invoked here; don't connect to a database.
const dbPath = require.resolve("../db");
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => ({ rows: [], rowCount: 0 }) } };
const { createCaptionHandler } = require("../ai/router");

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } });

test("Gemini kalit bo‘lmasa hech qanday tashqi so‘rov yuborilmaydi", async () => {
  let count = 0;
  const generate = createGeminiCaption({ env: {}, fetchImpl: async () => { count++; } });
  await assert.rejects(generate({ description: "fade" }), { status: 503, code: "ai_not_configured" });
  assert.equal(count, 0);
});

test("Gemini API kaliti URLda emas, headerda; matnni xavfsiz chegaralaydi", async () => {
  const saved = [];
  const generate = createGeminiCaption({ env: { GEMINI_API_KEY: "fake-for-unit-test", GEMINI_MODEL: "gemini-3.8-flash" },
    fetchImpl: async (url, options) => {
      saved.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "Yangi uslub — fade!" }] } }] }) };
    } });
  assert.equal(await generate({ description: "fade kesim", style: "short" }), "Yangi uslub — fade!");
  assert.equal(saved.length, 1);
  assert.ok(saved[0].url.endsWith(":generateContent"));
  assert.ok(!saved[0].url.includes("fake-for-unit-test"));
  assert.equal(saved[0].options.headers["x-goog-api-key"], "fake-for-unit-test");
  assert.ok(saved[0].options.body.includes("fade kesim"));
  assert.equal(await generate({ description: "fade" }), "Yangi uslub — fade!");
});

test("Gemini faqat haqiqiy, chegaralangan inputni qabul qiladi", async () => {
  const generate = createGeminiCaption({ env: { GEMINI_API_KEY: "fake" }, fetchImpl: async () => { throw Error("unexpected"); } });
  for (const description of ["", " ", "x".repeat(601), 17]) await assert.rejects(generate({ description }), { status: 400 });
  await assert.rejects(generate({ description: "soch", style: "anything" }), { status: 400 });
});

test("AI endpoint faqat barber uchun, 15 daqiqada 6 urinish", async () => {
  let count = 0;
  const action = createCaptionHandler({ generate: async () => { count++; return "Post tayyor"; }, clock: () => 100 });
  const user = { user: { role: "barber", accountId: 14 }, body: { description: "fade" } };
  assert.equal((await action({ ...user, user: { role: "customer", accountId: 14 } }, response())).statusCode, 403);
  for (let i = 0; i < 6; i++) { const res = response(); await action(user, res); assert.equal(res.statusCode, 200); }
  const limited = response(); await action(user, limited); assert.equal(limited.statusCode, 429); assert.equal(count, 6);
});
