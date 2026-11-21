// v150: dependency-free GitHub Pages source and toolchain preflight.
// Vite replaces %BASE_URL% during its HTML transform; root-relative public
// bootstrap files are broken when this app is hosted under /USTARA-New/.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES_BASE = '/USTARA-New/';
const failure = message => { throw new Error(`v150: ${message}; NOT PASS`); };
const getFile = name => {
  const st = fs.lstatSync(name, {throwIfNoEntry:false});
  if (!st?.isFile() || st.isSymbolicLink() || st.size===0) failure('missing/unsafe source asset');
  return fs.readFileSync(name,'utf8');
};
const attr = (attrs, key) => {
  const match=attrs.match(new RegExp(`(?:^|\\s)${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? match[1]??match[2] : null;
};
function assertLocalAsset(publicRoot, relative){
  if (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(relative) ||
      relative.split('/').some(part => part==='.'||part==='..'||part.startsWith('.')))
    failure('unsafe public resource path');
  const full=path.resolve(publicRoot,relative);
  if (!full.startsWith(path.resolve(publicRoot)+path.sep)) failure('public path escapes root');
  getFile(full);
  if (fs.realpathSync(full)!==full) failure('public resource symlink');
  return relative;
}
export function checkPagesSource(frontendRoot=FRONTEND){
  const root=path.resolve(frontendRoot);
  const html=getFile(path.join(root,'index.html'));
  const vite=getFile(path.join(root,'vite.config.js'));
  const main=getFile(path.join(root,'src','main.jsx'));
  const publicRoot=path.join(root,'public');
  if (!/\bbase\s*:\s*['"]\/USTARA-New\/['"]/.test(vite)) failure('Vite Pages base mismatch');
  if (!/<BrowserRouter\s+basename=\{import\.meta\.env\.BASE_URL\}/.test(main))
    failure('BrowserRouter base mismatch');
  let local=0,entry=0,stylesheet=0,icons=0,images=0,localeScript=0;
  for (const m of html.matchAll(/<(link|img|script)\b([^>]*?)>/gi)) {
    const tag=m[1].toLowerCase();
    const attributes=m[2];
    const rel=(attr(attributes,'rel')||'').toLowerCase();
    const ref=attr(attributes,tag==='link'?'href':'src');
    if (!ref) { if(tag==='img'||tag==='script') failure('HTML asset missing URL'); continue; }
    if (ref.startsWith('https://')) {
      if (tag==='script' || !/^https:\/\/fonts\.(?:googleapis|gstatic)\.com(?:\/|$)/.test(ref))
        failure('unapproved remote HTML asset');
      continue;
    }
    if (ref==='/src/main.jsx' && tag==='script' && attr(attributes,'type')==='module') {
      getFile(path.join(root,'src','main.jsx')); entry++; continue;
    }
    if (!ref.startsWith('%BASE_URL%')) failure('local HTML asset lacks base placeholder');
    const relative=ref.slice('%BASE_URL%'.length);
    assertLocalAsset(publicRoot,relative);
    local++;
    if(tag==='link'&&rel.split(/\s+/).includes('stylesheet')&&relative==='loading.css')stylesheet++;
    if(tag==='link'&&rel.split(/\s+/).includes('icon')&&relative==='brand/ustara.svg')icons++;
    if(tag==='img'&&relative==='brand/ustara.svg')images++;
    if(tag==='script'&&relative==='bootstrap-locale.js'){
      if(!/\sdefer(?:\s|>|=)/i.test(m[0]))failure('locale bootstrap must be deferred');
      localeScript++;
    }
  }
  if (entry!==1||stylesheet!==1||icons!==1||images!==1||localeScript!==1||local<4)
    failure('required HTML bootstrap assets incomplete');
  const css=getFile(path.join(publicRoot,'loading.css'));
  let cssRefs=0;
  for(const m of css.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/gi)){
    const url=m[1]??m[2]??m[3];
    if(url.startsWith('data:')||url.startsWith('#'))continue;
    if(url.startsWith('/') || url.includes(':')||url.includes('?')||url.includes('#'))
      failure('loading CSS resource must be base-relative');
    assertLocalAsset(publicRoot,url);
    cssRefs++;
  }
  if(cssRefs<1)failure('loading CSS brand resource missing');
  if (!/id=["']ustara-boot-status["']/.test(html) || !/id=["']ustara-boot-detail["']/.test(html)) failure('missing localized loading placeholders');
  return {base:PAGES_BASE,htmlAssets:local,entry,cssRefs};
}
export function checkFrontendLock(frontendRoot=FRONTEND){
  const root=path.resolve(frontendRoot);
  let manifest,lock;
  try {
    manifest=JSON.parse(getFile(path.join(root,'package.json')));
    lock=JSON.parse(getFile(path.join(root,'package-lock.json')));
  }catch{failure('missing/invalid npm manifest or lock');}
  if (lock.lockfileVersion!==3||!lock.packages?.['']||!lock.packages?.['node_modules/vite']||
      !lock.packages?.['node_modules/react']) failure('incomplete npm lock');
  for(const field of ['dependencies','devDependencies']){
    if(JSON.stringify(Object.entries(manifest[field]||{}).sort())!==
       JSON.stringify(Object.entries(lock.packages[''][field]||{}).sort()))
      failure('npm manifest and lock dependencies differ');
  }
  if(!manifest.scripts?.build?.includes('vite build'))failure('missing Vite build script');
  if(!manifest.scripts?.['preflight:pages']?.includes('v150-pages-source-check.mjs'))
    failure('missing Pages source gate script');
  return {lockfile:3,viteLocked:lock.packages['node_modules/vite'].version};
}
export function checkInstalledToolchain(frontendRoot=FRONTEND){
  const root=path.resolve(frontendRoot);
  const vite=path.join(root,'node_modules','vite','bin','vite.js');
  const installed=fs.lstatSync(vite,{throwIfNoEntry:false})?.isFile()===true;
  return {viteInstalled:installed,buildPossible:installed};
}
if (process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  try{
    const source=checkPagesSource();
    const lock=checkFrontendLock();
    const deps=checkInstalledToolchain();
    if (process.argv.includes('--json'))
      console.log(JSON.stringify({source:'PASS',sourceDetails:source,lock:'PASS',lockDetails:lock,toolchain:deps.viteInstalled?'PRESENT':'BLOCKED_MISSING_VITE'},null,2));
    else console.log(`v150: Pages source PASS (${source.htmlAssets} bootstrap refs), npm lock PASS; Vite ${deps.viteInstalled?'PRESENT':'NOT INSTALLED'}`);
    if(process.argv.includes('--require-deps')&&!deps.buildPossible)process.exitCode=2;
  }catch(e){console.error(e.message);process.exitCode=1;}
}
