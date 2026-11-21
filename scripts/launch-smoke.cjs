'use strict';
// Read-only public launch smoke check, no account tokens, writes, migrations or secrets.
function parsePublicOrigin(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(label + ': HTTPS origin kerak'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash || url.hostname === 'localhost' ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname)) {
    throw new Error(label + ': faqat ommaviy HTTPS origin kiriting (path yoki token emas)');
  }
  return url.origin;
}
function builtAssets(html, origin) {
  // A 200 HTML shell alone does not prove that Vite's JS/CSS bundles were deployed.
  const tags = [...html.matchAll(/<(?:script|link)\b[^>]*>/gi)].map(m=>m[0]);
  const scripts = [];
  const styles = [];
  for (const tag of tags) {
    const src = /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1];
    const href = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1];
    if (/^<script\b/i.test(tag) && /\btype=["']module["']/i.test(tag) && src) scripts.push(src);
    if (/^<link\b/i.test(tag) && /\brel=["']stylesheet["']/i.test(tag) && href && /\.css(?:$|[?#])/.test(href)) styles.push(href);
  }
  const modules = scripts.filter(s=>/\.js(?:$|[?#])/.test(s));
  const bundledCss = styles.filter(s=>s.includes('/assets/'));
  if (!modules.length || !bundledCss.length) throw new Error('Vite build JS/CSS topilmadi');
  const normalize = (source, extension) => {
    let url;
    try { url = new URL(source, origin); } catch { throw new Error('Build asset URL noto‘g‘ri'); }
    if (url.origin!==origin || !url.pathname.startsWith('/assets/') ||
        !url.pathname.endsWith(extension) || url.search || url.hash) {
      throw new Error('Build asset noto‘g‘ri domen yoki yo‘lda');
    }
    return url.pathname;
  };
  // Check the entry bundle and the compiled stylesheet, not every lazy-loaded chunk.
  return [normalize(modules[0],'.js'), normalize(bundledCss[0],'.css')];
}
async function runLaunchSmoke(frontend, backend, fetchImpl=fetch) {
  const site = parsePublicOrigin(frontend, 'Frontend');
  const api = parsePublicOrigin(backend, 'Backend');
  if (site === api) throw new Error('Frontend va backend uchun alohida origin kutilmoqda');
  const checked=[];
  async function get(path, origin, kind, originHeader) {
    const response = await fetchImpl(origin+path, {
      method:'GET', redirect:'error', cache:'no-store',
      signal:AbortSignal.timeout(10000),
      headers:{Accept:kind==='html'?'text/html':kind==='js'?'text/javascript':kind==='css'?'text/css':'application/json',
        ...(originHeader?{Origin:originHeader}:{})},
    });
    if (!response.ok) throw new Error(path+': HTTP '+response.status);
    const type=(response.headers.get('content-type')||'').toLowerCase();
    let html;
    if (kind==='html') {
      if (!type.includes('text/html')) throw new Error(path+': HTML sahifa topilmadi');
      html=await response.text();
      if (!/<div\s+id=["']root["']/.test(html)) throw new Error(path+': React sahifasi topilmadi');
    } else if (kind==='js' || kind==='css') {
      if (kind==='js' && !/(?:javascript|ecmascript)/.test(type)) throw new Error(path+': JavaScript bundle topilmadi');
      if (kind==='css' && !type.includes('text/css')) throw new Error(path+': CSS bundle topilmadi');
    } else {
      if (!type.includes('application/json')) throw new Error(path+': JSON javob topilmadi');
      const data=await response.json();
      if (kind==='ready' && data?.status!=='ready') throw new Error(path+': baza tayyor emas');
      if (kind==='health' && typeof data?.message!=='string') throw new Error(path+': health javob formati noto‘g‘ri');
      if (kind==='barbers' && !Array.isArray(data)) throw new Error(path+': sartaroshlar ro‘yxati noto‘g‘ri');
    }
    if (originHeader && response.headers.get('access-control-allow-origin')!==originHeader) {
      throw new Error(path+': CORS GET javobida frontend origin ruxsati yo‘q');
    }
    checked.push(origin+path);
    return html;
  }
  const html = await get('/', site,'html');
  const [js, css] = builtAssets(html, site);
  await get(js, site, 'js');
  await get(css, site, 'css');
  await get('/login',site,'html');
  await get('/barbers',site,'html');
  await get('/api/health',api,'health');
  await get('/api/ready',api,'ready');
  // Preflight success alone can conceal a failing public directory SQL query.
  await get('/api/barbers',api,'barbers',site);
  const preflight=await fetchImpl(api+'/api/barbers', {
    method:'OPTIONS', redirect:'error', signal:AbortSignal.timeout(10000),
    headers:{Origin:site,'Access-Control-Request-Method':'GET'},
  });
  if (!preflight.ok || preflight.headers.get('access-control-allow-origin')!==site) {
    throw new Error('CORS: Cloudflare origin backendda ruxsat etilmagan');
  }
  checked.push('CORS OPTIONS /api/barbers');
  return checked;
}

if (require.main===module) {
  runLaunchSmoke(process.argv[2],process.argv[3]).then(items=>{
    for (const item of items) console.log('OK:',item);
    console.log('Public smoke-test o‘tdi. OTP va bron yaratish hali alohida qo‘lda sinov talab qiladi.');
  }).catch(()=>{
    // Do not echo raw transport messages: URLs may contain provider metadata.
    console.error('Public smoke-test muvaffaqiyatsiz. Sayt/API manzili, HTTPS, CORS yoki DB schema tayyorligini tekshiring.');
    process.exitCode=1;
  });
}
module.exports={runLaunchSmoke,parsePublicOrigin,builtAssets};
