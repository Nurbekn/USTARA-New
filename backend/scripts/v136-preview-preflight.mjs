#!/usr/bin/env node
// Offline, read-only preflight. This does NOT test a live HTTPS deployment or
// prove that Telegram/WhatsApp crawlers have fetched or cached a link.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {validOrigin, appBase} = require('../services/publicProfilePreview.js');
const backend = path.resolve(here, '..');
const project = path.resolve(backend, '..');

export function jpegDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let i = 2;
  while (i < buffer.length) {
    if (buffer[i++] !== 0xff) return null;
    while (buffer[i] === 0xff) i++;
    const marker = buffer[i++];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 2 > buffer.length) return null;
    const segmentLength = buffer.readUInt16BE(i);
    if (segmentLength < 2 || i + segmentLength > buffer.length) return null;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      if (segmentLength < 7) return null;
      return {width:buffer.readUInt16BE(i+5),height:buffer.readUInt16BE(i+3)};
    }
    i += segmentLength;
  }
  return null;
}

export function inspectPreviewDeployment(env = {}, options = {}) {
  const root = options.projectRoot || project;
  const origin = validOrigin(env.PUBLIC_PROFILE_PREVIEW_ORIGIN);
  const app = appBase(env.PUBLIC_PROFILE_APP_BASE_URL);
  const frontendOrigin = validOrigin(env.VITE_PUBLIC_PROFILE_PREVIEW_ORIGIN);
  const checks=[];
  const add = (id,ok) => checks.push({id, ok: Boolean(ok)});
  add('preview_https_origin',origin);
  add('frontend_https_app_base',app);
  add('client_preview_origin_matches',origin && frontendOrigin && origin===frontendOrigin);
  let dims=null, bytes=0;
  try {
    const asset=fs.readFileSync(path.join(root,'backend/public/share-assets/profile-preview.jpg'));
    bytes=asset.byteLength;dims=jpegDimensions(asset);
  } catch { /* Missing asset is a failed check, never silently accepted. */ }
  add('jpeg_image_1200x630',dims?.width===1200 && dims?.height===630 && bytes < 200000);
  let viteBase=null, serverRoutePresent=false;
  try {
    const config=fs.readFileSync(path.join(root,'frontend/vite.config.js'),'utf8');
    viteBase=config.match(/\bbase:\s*['"](\/[A-Za-z0-9_/-]*\/)['"]/)?.[1] ?? null;
    if(viteBase && !/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(viteBase)) viteBase=null;
    const server=fs.readFileSync(path.join(root,'backend/server.js'),'utf8');
    serverRoutePresent=server.includes('app.get("/share/barbers/:id", require("./controllers/publicProfilePreview"))');
  } catch { /* Incomplete source tree. */ }
  add('app_base_matches_vite',app && viteBase && new URL(app).pathname.replace(/\/+$/,'')===viteBase.replace(/\/+$/,''));
  add('preview_route_registered',serverRoutePresent);
  return {
    status: checks.every(x=>x.ok) ? 'READY_FOR_LIVE_VERIFICATION' : 'BLOCKED_CONFIG_OR_ASSET',
    checks,
    liveHttps: 'NOT_RUN',
    crawlerUnfurl: 'NOT_RUN',
    viteBuild: 'NOT_RUN',
    postgresIntegration: 'NOT_RUN',
    productionReady: false,
  };
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result = inspectPreviewDeployment(process.env);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(result.status !== 'READY_FOR_LIVE_VERIFICATION') process.exitCode=2;
}
