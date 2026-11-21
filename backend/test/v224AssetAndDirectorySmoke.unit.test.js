const {test}=require('node:test');
const assert=require('node:assert/strict');
const {builtAssets}=require('../../scripts/launch-smoke.cjs');
const origin='https://ustara.pages.dev';
const template=(js,css)=>`<div id="root"></div><script crossorigin type="module" src="${js}"></script><link href="${css}" rel="stylesheet">`;
test('v224: Vite build HTML entry JS/CSS is required',()=>{
  assert.deepEqual(builtAssets(template('/assets/app-123.js','/assets/app-123.css'),origin),['/assets/app-123.js','/assets/app-123.css']);
  assert.throws(()=>builtAssets('<div id="root"></div>',origin));
  assert.throws(()=>builtAssets(template('/src/main.jsx','/loading.css'),origin));
});
test('v224: external, cross-origin and non-bundle asset references rejected',()=>{
  for(const js of ['https://attacker.example/assets/app.js','/somewhere/app.js','/assets/app.js?token=abc','//attacker.example/assets/app.js']){
    assert.throws(()=>builtAssets(template(js,'/assets/app.css'),origin));
  }
  for(const css of ['https://attacker.example/assets/app.css','/other/app.css','/assets/app.css?key=1']){
    assert.throws(()=>builtAssets(template('/assets/app.js',css),origin));
  }
});
