import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateProductionApiBaseUrl} from '../scripts/validate-production-api.mjs';
import {canonicalPublicBarberUrl} from '../src/pages/user/barber/publicShare.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(name)=>readFileSync(path.join(root,name),'utf8');

test('Cloudflare: faqat haqiqiy HTTPS backend origin qabul qilinadi',()=>{
  assert.equal(validateProductionApiBaseUrl('https://api.ustara.uz'),'https://api.ustara.uz');
  assert.equal(validateProductionApiBaseUrl('https://ustara-api.onrender.com/'),'https://ustara-api.onrender.com');
  for(const value of [undefined,'',' https://api.example.com','http://api.example.com','http://localhost:5000',
    'https://localhost','https://127.0.0.1','https://api.example.com/api',
    'https://api.example.com/?token=hidden','https://api.example.com/#x',
    'https://user:password@api.example.com','javascript:alert(1)','https://api.example.com.evil/x']) {
    assert.throws(()=>validateProductionApiBaseUrl(value));
  }
});

test('Cloudflare: noto‘g‘ri yoki yo‘q API manzili bilan build boshlanmaydi',()=>{
  const script=path.join(root,'scripts/validate-production-api.mjs');
  const missing=spawnSync(process.execPath,[script],{env:{...process.env,VITE_API_BASE_URL:''},encoding:'utf8'});
  assert.notEqual(missing.status,0);
  assert.match(missing.stderr,/HTTPS public API origin required/);
  const valid=spawnSync(process.execPath,[script],{env:{...process.env,VITE_API_BASE_URL:'https://api.ustara.uz'},encoding:'utf8'});
  assert.equal(valid.status,0);
  assert.doesNotMatch(valid.stdout,/api\.ustara\.uz/); // No deployment host in CI logs
});

test('Cloudflare: build root base, browser router root va SPA fallback',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['prebuild:cloudflare'],'node scripts/validate-production-api.mjs');
  assert.equal(pkg.scripts['build:cloudflare'],'vite build --base=/');
  assert.match(read('vite.config.js'),/base:\s*['"]\/USTARA-New\/['"]/); // GitHub Pages unchanged
  assert.match(read('src/main.jsx'),/basename=\{import\.meta\.env\.BASE_URL\}/);
  assert.match(read('public/_redirects'),/^\/\* \/index\.html 200$/m);
  assert.equal(canonicalPublicBarberUrl(9,'https://ustara.pages.dev','/'),'https://ustara.pages.dev/barbers/9');
  assert.match(read('src/pages/barber/data/v154QrSiteDestination.js'),/['"]\/['"]/);
});
