const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const dbPath = require.resolve('../db');
assert.equal(require.cache[dbPath], undefined);
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => {throw Error('no SQL');},connect: async () => {throw Error('no SQL');} }};
after(() => { delete require.cache[dbPath]; });
const bookings = require('../routes/bookings');
const services = require('../routes/services');
const barbers = require('../routes/barbers');
const routes = router => router.stack.filter(layer => layer.route).map(layer => ({path:layer.route.path,
  methods:layer.route.methods,handlers:layer.route.stack.map(handler => handler.handle.name)}));
test('guest public GETs are readable while POST booking still has auth middleware', () => {
  const b=routes(bookings);const slots=b.find(r=>r.path==='/available-slots');
  assert.equal(slots.methods.get,true);assert.equal(slots.handlers.length,1);
  const create=b.find(r=>r.path==='/'&&r.methods.post);
  assert.equal(create.handlers[0],'authMiddleware');
  const publicServices=routes(services).find(r=>r.path==='/public');
  assert.ok(publicServices);assert.equal(publicServices.handlers.length,1);
  const privateServices=routes(services).find(r=>r.path==='/'&&r.methods.post);
  assert.equal(privateServices.handlers[0],'authMiddleware');
  const hours=routes(barbers).find(r=>r.path==='/:id/working-hours');
  assert.equal(hours.handlers.length,1);
});
