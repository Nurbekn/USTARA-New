const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const routePath = require.resolve('../routes/barbers');

// Exercise real Express route matching without loading a database or dotenv.
function loadRouter() {
  const compiled = new Module(routePath, module);
  compiled.filename = routePath;
  compiled.paths = module.paths;
  const unused = new Proxy({}, { get: () => (_req, _res, next) => next() });
  compiled.require = (name) => {
    if (name === 'express') return require('express');
    if (name === '../middleware/authMiddleware') return (req, _res, next) => {
      req.authChecked = true;
      next();
    };
    if (name === '../controllers/cancellationPolicyController') return { createCancellationPolicyHandlers: () => ({
      mine: (_req, res) => res.json({}), update: (_req, res) => res.json({}), publicRead: (_req, res) => res.json({}),
    }) };
    if (name === '../controllers/breakRulesController') return { createHandlers: () => ({
      list: (_req,res) => res.json({weekly:[],dated:[]}),
      weekly: (_req,res) => res.json({}),dated: (_req,res) => res.json({}),
    }) };
    if (name === '../controllers/calendarExceptionsController') return { createHandlers: () => ({
      list: (_req,res) => res.json([]),save: (_req,res) => res.json({}),remove: (_req,res) => res.json({}),
    }) };
    if (name === '../controllers/socialController') return {
      getPortfolio(req, res) { res.json({ id: req.params.id, authChecked: req.authChecked }); },
    };
    if (name === '../controllers/reviewsController') return {
      getPublicReviews(req, res) { res.json({ id: req.params.id, authChecked: req.authChecked }); },
    };
    if (name.startsWith('../controllers/')) return unused;
    throw new Error('Unexpected route dependency');
  };
  compiled._compile(fs.readFileSync(routePath, 'utf8'), routePath);
  return compiled.exports;
}

for (const suffix of ['portfolio', 'reviews']) {
  for (const hasBearer of [false, true]) {
    test(`approved public ${suffix} route ${hasBearer ? 'validates supplied Bearer' : 'permits guests'}`, async () => {
      const router = loadRouter();
      const headers = hasBearer ? { authorization: 'Bearer test-valid-jwt' } : {};
      const body = await new Promise((resolve, reject) => {
        router.handle({ method: 'GET', url: `/23/${suffix}`, headers },
          { json: resolve }, (error) => reject(error || new Error('Route not found')));
      });
      assert.deepEqual(body, { id: '23', authChecked: hasBearer ? true : undefined });
    });
  }
}
test('private /me/portfolio requires an account in controller', async () => {
  const router = loadRouter();
  const result = await new Promise((resolve, reject) => {
    router.handle({ method: 'GET', url: '/me/portfolio', headers: {} },
      { json: resolve }, (error) => reject(error || new Error('Route not found')));
  });
  assert.equal(result.id, 'me');
  assert.equal(result.authChecked, undefined);
});
