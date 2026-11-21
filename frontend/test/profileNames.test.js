import { test } from "node:test";
import assert from "node:assert/strict";
import { profileName, authorName } from "../src/utils/profileName.js";
import { nameOf, normalizeCatalog, selectResults } from "../src/pages/user/explore/catalog.js";
import { barberName } from "../src/pages/user/bookings/model.js";
import { normalizeSocial, searchPosts } from "../src/pages/user/social/model.js";

test("profile labels use split fields, preserve 80+80 characters and ignore legacy fields", () => {
  const person = { first_name: "A".repeat(80), last_name: "B".repeat(80), name: "Legacy field must not be read" };
  assert.equal(profileName(person).length, 161);
  assert.equal(profileName({ firstName: "Ali", lastName: "Vali" }), "Ali Vali");
  assert.equal(profileName({ name: "Legacy" }), "");
  assert.equal(profileName({ first_name: null, last_name: "Vali" }), "Vali");
  assert.equal(barberName({ barber: person }).length, 161);
  assert.equal(authorName({ ...person, role: "barber" }).length, 161);
  assert.equal(authorName({ role: "salon", name: "Salon title" }), "Salon title");
});

test("catalog cards and search use split barber names while keeping salon/service names", () => {
  const barber = { id: "1", first_name: "Ali", last_name: "Valiyev", name: "Ignored", serviceIds: [] };
  const catalog = normalizeCatalog({ barbers: [barber], salons: [{ id: "2", name: "Salon" }], services: [] });
  assert.equal(nameOf(barber, "barbers"), "Ali Valiyev");
  assert.equal(nameOf(catalog.salons[0], "salons"), "Salon");
  assert.equal(selectResults(catalog, "barbers", new URLSearchParams("q=Valiyev"), null).length, 1);
  assert.equal(selectResults(catalog, "barbers", new URLSearchParams("q=Ignored"), null).length, 0);
});

test("social authors and discovered barbers accept split-name API objects", () => {
  const author = { id: "1", role: "barber", first_name: "Ali", last_name: "Valiyev" };
  const data = normalizeSocial({ posts: [], services: [], discover: { barbers: [author], salons: [{ id: "s", name: "Salon" }] } });
  assert.equal(data.discover.barbers.length, 1);
  assert.equal(data.discover.salons.length, 1);
  assert.deepEqual(normalizeSocial({ posts: [], services: [], discover: { barbers: {} } }).discover.barbers, []);
  assert.equal(authorName(author), "Ali Valiyev");
  assert.equal(searchPosts([{ author, caption: "", serviceIds: [] }], [], "Valiyev").length, 1);
});
