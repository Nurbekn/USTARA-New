import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";

// Katalogning kechiktirilgan transport importini ham ochadigan rekursiv test yuklagichi.
// Haqiqiy adapter, soxta fetch; .env ochilmaydi va backendga ulanilmaydi.
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function loadModule(url) {
  let source = (await readFile(url, "utf8")).replaceAll("import.meta.env", '{"DEV":true}');
  for (const match of source.matchAll(/(from\s+|import\()"([^"]+)"/g)) {
    const dependency = await loadModule(new URL(match[2], url));
    source = source.replace(match[0], `${match[1]}"${dependency}"`);
  }
  return moduleUrl(source);
}
const { loadExploreCatalog, normalizeCatalog, selectResults, nameOf } = await import(
  await loadModule(new URL("../src/pages/user/explore/catalog.js", import.meta.url)));
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const token = "test-current-session-jwt";
const barber = { id: 23, first_name: "Ali", last_name: "Valiyev", phone: "+998901234567",
  created_at: "2030-01-01T00:00:00Z", verification_status: "approved", specialty: "stylist" };

test("loads controller array using GET /api/barbers with caller JWT and unchanged fields", async () => {
  let calls = 0;
  const controller = new AbortController();
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "http://localhost:5000/api/barbers");
    assert.equal(options.method, "GET");
    assert.equal(new Headers(options.headers).get("Authorization"), `Bearer ${token}`);
    assert.equal(options.body, undefined);
    assert.equal(options.credentials, "omit");
    assert.ok(!url.includes(token));
    return new Response(JSON.stringify([barber]));
  };
  const catalog = normalizeCatalog(await loadExploreCatalog({ token, signal: controller.signal }));
  assert.deepEqual(catalog, { barbers: [barber], salons: [], services: [] });
  assert.equal(calls, 1);
  assert.equal(catalog.barbers[0].rating, undefined);
  assert.equal(catalog.barbers[0].available, undefined);
  assert.equal(catalog.barbers[0].startingPrice, undefined);
});

test("empty API array produces empty catalog without demo fallback", async () => {
  globalThis.fetch = async () => new Response("[]");
  assert.deepEqual(await loadExploreCatalog({ token }), { barbers: [], salons: [], services: [] });
});

test("barber javobidagi haqiqiy xizmatlar Explore katalogiga yig‘iladi", async () => {
  const service = { id: 7, name: "Soch olish", description: null, category: null,
    minPrice: 25000, maxPrice: 25000, barberIds: [23], salonIds: [] };
  const listedBarber = { ...barber, startingPrice: 25000, serviceIds: [7], services: [service] };
  globalThis.fetch = async () => new Response(JSON.stringify([listedBarber]));
  const catalog = normalizeCatalog(await loadExploreCatalog({ token }));
  assert.deepEqual(catalog.services, [service]);
  assert.deepEqual(selectResults(catalog, "barbers", new URLSearchParams("service=7"), null), [listedBarber]);
  assert.deepEqual(selectResults(catalog, "barbers", new URLSearchParams("q=SOCH"), null), [listedBarber]);
});

test("API errors propagate status/code/message and do not become empty success", async () => {
  for (const status of [401, 500]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ message: "Backend message", code: "backend_code" }), { status });
    await assert.rejects(loadExploreCatalog({ token }), { status, code: "backend_code", message: "Backend message" });
  }
});

test("malformed catalog responses are rejected", async () => {
  for (const data of [{ barbers: [barber] }, [null], [{ id: 23 }], null]) {
    globalThis.fetch = async () => new Response(JSON.stringify(data));
    await assert.rejects(loadExploreCatalog({ token }), { message: "Serverdan barberlar ro‘yxati olinmadi." });
  }
});

test("split-name search works and filters do not invent absent API data", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify([barber]));
  const catalog = await loadExploreCatalog({ token });
  assert.equal(nameOf(barber, "barbers"), "Ali Valiyev");
  assert.deepEqual(selectResults(catalog, "barbers", new URLSearchParams("q=VALIYEV"), null), [barber]);
  assert.deepEqual(selectResults(catalog, "barbers", new URLSearchParams("q=missing"), null), []);
  for (const filter of ["region=Toshkent", "min=1000", "rating=4", "available=1", "service=7", "distance=5"]) {
    assert.deepEqual(selectResults(catalog, "barbers", new URLSearchParams(filter), { lat: 41, lng: 69 }), []);
  }
});

test("aborted load makes no request", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected fetch"); };
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(loadExploreCatalog({ token, signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 0);
});

test('aniq tasdiqlanmagan profil va uning xizmatlari katalogga kiritilmaydi', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify([{ ...barber, verification_status: 'pending', services: [{ id: 99, name: 'Xizmat' }] }]));
  const result = await loadExploreCatalog({ token });
  assert.deepEqual(result.barbers, []);assert.deepEqual(result.services, []);
});


test('guest discovers only approved directory without authorization header', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/barbers');
    assert.equal(new Headers(options.headers).get('Authorization'), null);
    return new Response(JSON.stringify([barber]));
  };
  assert.equal((await loadExploreCatalog()).barbers[0].id,23);
});

// v115 qarorlar #16 (Smart Search) va #164 (manzil/tuman) regressiyasi.
const areaBarbers = [
  {
    id: 31, first_name: "Dilshod", last_name: "Yo‘ldoshev",
    specialty: "Soch ustasi", salonName: "Markaz Salon",
    address: "Toshkent, Yunusobod tumani, 8-mavze",
    serviceIds: [101], startingPrice: 30000,
    services: [{ id: 101, name: "Fade kesim", minPrice: 30000, maxPrice: 30000, barberIds: [31], salonIds: [] }],
  },
  {
    id: 32, first_name: "Akmal", last_name: "Karimov",
    specialty: "Klassik sartarosh", salonName: "Yulduz",
    address: "Samarqand, Registon ko‘chasi",
    serviceIds: [102], startingPrice: 45000,
    services: [{ id: 102, name: "Soqol olish", minPrice: 45000, maxPrice: 45000, barberIds: [32], salonIds: [] }],
  },
  {
    id: 33, first_name: "Sarvar", last_name: "Aliyev",
    specialty: "Fade usta", salonName: "Yunus", address: null,
    serviceIds: [], services: [], startingPrice: null,
  },
];
const areaCatalog = normalizeCatalog({ barbers: areaBarbers, salons: [], services: areaBarbers.flatMap((p) => p.services) });
const idsFor = (query) => selectResults(areaCatalog, "barbers", new URLSearchParams(query), null).map((v) => v.id);

test("v115: tumanning nomi umumiy qidiruvda manzil matnidan topiladi", () => {
  assert.deepEqual(idsFor("q=Yunusobod"), [31]);
  assert.deepEqual(idsFor("q=registon"), [32]);
});

test("v115: ism, mutaxassislik, salon va xizmat qidiruvda qatnashadi", () => {
  assert.deepEqual(idsFor("q=Dilshod"), [31]);
  assert.deepEqual(idsFor("q=KLASSIK"), [32]);
  assert.deepEqual(idsFor("q=markaz salon"), [31]);
  assert.deepEqual(idsFor("q=soqol"), [32]);
});

test("v115: ko‘p so‘zli qidiruv bir nechta aniq maydonni birlashtiradi", () => {
  assert.deepEqual(idsFor("q=yunusobod fade"), [31]);
  assert.deepEqual(idsFor("q=yunusobod soQol"), []);
});

test("v115: manzil yoki tuman filtri mustaqil va umumiy qidiruv bilan ishlaydi", () => {
  assert.deepEqual(idsFor("area=Yunusobod"), [31]);
  assert.deepEqual(idsFor("area=registon&q=akmal"), [32]);
  assert.deepEqual(idsFor("area=registon&q=Dilshod"), []);
});

test("v115: manzili yo‘q profilni tuman sifatida taxmin qilmaydi", () => {
  assert.deepEqual(idsFor("area=Yunus"), [31]);
  assert.deepEqual(idsFor("area=12345"), []);
});

test("v115: o‘zbekcha apostroflar va ortiqcha probellar izlashni buzmaydi", () => {
  assert.deepEqual(idsFor("q=YO%27LDOSHEV"), [31]);
  assert.deepEqual(idsFor("q=%20%20fade%20%20kesim%20%20"), [31]);
  assert.deepEqual(idsFor("area=registon+ko%27chasi"), [32]);
});

test("v115: narx va xizmat filtri manzil bilan birgalikda ishlaydi", () => {
  assert.deepEqual(idsFor("area=yunusobod&service=101&min=25000&max=35000"), [31]);
  assert.deepEqual(idsFor("area=yunusobod&service=102"), []);
  assert.deepEqual(idsFor("area=yunusobod&max=10000"), []);
});

test("v115: geografik koordinata, reyting yoki mavjudlik taxmin qilinmaydi", () => {
  assert.deepEqual(idsFor("distance=5&area=yunusobod"), []);
  assert.deepEqual(idsFor("rating=4&area=yunusobod"), []);
  assert.deepEqual(idsFor("available=1&area=yunusobod"), []);
});

test("v115: qidiruv manzil filtri boshqa katalogning tasodifiy xizmatini kiritmaydi", () => {
  const serviceResults = selectResults(areaCatalog, "services", new URLSearchParams("area=Yunusobod&q=Fade"), null);
  assert.deepEqual(serviceResults.map((x) => x.id), [101]);
  assert.deepEqual(selectResults(areaCatalog, "services", new URLSearchParams("area=Registon&q=Fade"), null), []);
});
