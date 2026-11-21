import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {auditSourceGraph} from '../scripts/v153-source-graph.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function fixture(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-v153-graph-'));
 function put(name,content){const p=path.join(dir,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,content);return p;}
 put('src/main.jsx',`import './feature.js'; import('./dynamic.jsx'); export { thing } from './feature.js'; import './site.css';`);
 put('src/feature.js',`export const thing=1`);
 put('src/dynamic.jsx',`export default function Demo(){return null}`);
 put('src/site.css',`a{background-image:url('./icon.svg')}`);
 put('src/icon.svg','<svg/>');put('public/loading.css',`a{mask:url('brand/logo.svg')}`);put('public/brand/logo.svg','<svg/>');
 try{return fn(dir,put);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('v153: real frontend source graph and styles have no broken relative paths',()=>{
 const report=auditSourceGraph(ROOT);
 assert.equal(report.status,'PASS_SOURCE_GRAPH_ONLY');
 assert.ok(report.jsFiles>=175);assert.ok(report.cssFiles>=30);
 assert.ok(report.localImports>550);assert.ok(report.dynamicImports>30);
 assert.equal(report.viteBuild,'NOT_RUN');assert.equal(report.productionReady,false);
});
test('v153: running package-free source graph CLI succeeds and never claims a build',()=>{
 const result=spawnSync(process.execPath,['scripts/v153-source-graph.mjs','--json'],{cwd:ROOT,encoding:'utf8',timeout:8000});
 assert.equal(result.status,0,result.stderr);const report=JSON.parse(result.stdout);
 assert.equal(report.browserE2E,'NOT_RUN');assert.equal(report.productionReady,false);
});
test('v153: valid static, export, extensionless, lazy and local CSS imports resolve',()=>fixture(root=>{
 const r=auditSourceGraph(root);assert.equal(r.jsFiles,3);assert.equal(r.cssFiles,2);
 assert.ok(r.localImports>=3);assert.equal(r.dynamicImports,1);assert.equal(r.localCssAssets,2);
}));
test('v153: missing static import is rejected',()=>fixture((root,put)=>{
 put('src/main.jsx',`import './missing';`);assert.throws(()=>auditSourceGraph(root),/unresolved/);
}));
test('v153: wrong letter case in import is rejected on all file systems',()=>fixture((root,put)=>{
 put('src/main.jsx',`import './Feature.js'`);assert.throws(()=>auditSourceGraph(root),/case-mismatched/);
}));
test('v153: missing lazy dynamic import is rejected',()=>fixture((root,put)=>{
 put('src/main.jsx',`const Screen=()=>import('./NotExisting.jsx')`);assert.throws(()=>auditSourceGraph(root),/unresolved/);
}));
test('v153: source import attempting to escape src is rejected',()=>fixture((root,put)=>{
 put('src/main.jsx',`import '../public/loading.css'`);assert.throws(()=>auditSourceGraph(root),/escapes src/);
}));
test('v153: relative module query suffix is rejected rather than silently ignored',()=>fixture((root,put)=>{
 put('src/main.jsx',`import './feature.js?raw'`);assert.throws(()=>auditSourceGraph(root),/unsupported/);
}));
test('v153: root absolute CSS URLs are rejected for GitHub Pages subpath',()=>fixture((root,put)=>{
 put('src/site.css',`a{background:url('/images/a.webp')}`);assert.throws(()=>auditSourceGraph(root),/unbased CSS root/);
}));
test('v153: missing CSS asset is rejected',()=>fixture((root,put)=>{
 put('src/site.css',`a{background:url('./missing.svg')}`);assert.throws(()=>auditSourceGraph(root),/missing CSS asset/);
}));
test('v153: wrong case CSS asset is rejected',()=>fixture((root,put)=>{
 put('src/site.css',`a{background:url('./ICON.svg')}`);assert.throws(()=>auditSourceGraph(root),/missing CSS asset/);
}));
test('v153: CSS asset traversal outside source fails closed',()=>fixture((root,put)=>{
 put('src/site.css',`a{background:url('../../outside.svg')}`);assert.throws(()=>auditSourceGraph(root),/missing CSS asset/);
}));
test('v153: http and protocol-relative CSS assets are rejected',()=>fixture((root,put)=>{
 put('src/site.css',`a{background:url('http://evil.example/tracker.png')}`);assert.throws(()=>auditSourceGraph(root),/unapproved/);
 put('src/site.css',`a{background:url('//evil.example/tracker.png')}`);assert.throws(()=>auditSourceGraph(root),/unapproved|unbased/);
}));
test('v153: HTTPS font CSS and data URLs are allowed without pretending they were fetched',()=>fixture((root,put)=>{
 put('src/site.css',`@import url('https://fonts.googleapis.com/css?family=Inter');a{background:url('data:image/svg+xml,abc')}`);
 const r=auditSourceGraph(root);assert.equal(r.localCssAssets,1);
}));
test('v153: symlink to a file outside the source is rejected',()=>fixture((root,put)=>{
 const external=put('public/external.js','export const outside=true');
 fs.symlinkSync(external,path.join(root,'src/link.js'));
 assert.throws(()=>auditSourceGraph(root),/symlink/);
}));
test('v153: missing public loader image is rejected',()=>fixture(root=>{
 fs.rmSync(path.join(root,'public/brand/logo.svg'));assert.throws(()=>auditSourceGraph(root),/missing CSS asset/);
}));
test('v153: gallery uses BASE_URL and public image exists',()=>{
 const css=fs.readFileSync(path.join(ROOT,'src/pages/user/UserHome.css'),'utf8');
 const jsx=fs.readFileSync(path.join(ROOT,'src/pages/user/UserHome.jsx'),'utf8');
 assert.match(css,/background-image: var\(--uh-gallery-url, none\)/);
 assert.match(jsx,/import\.meta\.env\.BASE_URL\}images\/haircut-views\.webp/);
 assert.ok(fs.statSync(path.join(ROOT,'public/images/haircut-views.webp')).size>0);
});
test('v153: reverting gallery CSS to root-absolute asset fails audit',()=>fixture((root,put)=>{
 put('src/pages/user/UserHome.css',`.uh-style-preview { background-image: url('/images/haircut-views.webp'); }`);
 put('src/pages/user/UserHome.jsx',`export default function Home(){return null}`);
 put('public/images/haircut-views.webp','demo');
 assert.throws(()=>auditSourceGraph(root),/unbased CSS root/);
}));
test('v153: gallery custom property missing is blocked',()=>fixture((root,put)=>{
 put('src/pages/user/UserHome.css',`.uh-style-preview { background-image: var(--uh-gallery-url, none); }`);
 put('src/pages/user/UserHome.jsx',`export default function Home(){return null}`);
 put('public/images/haircut-views.webp','demo');
 assert.throws(()=>auditSourceGraph(root),/gallery must use Vite base/);
}));
