'use strict';
// Package-free build inspection shared by upstream verification and Pages.
// No API calls, DB or npm backend imports. Check again after the Pages rebuild.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {validateCssResources}=require('./css-resource-check.cjs');
const {validateJsChunkReferences}=require('./js-chunk-check.cjs');
const {validateManifestResources}=require('./webmanifest-check.cjs');
function fail(message){throw new Error(`v58: ${message}; NOT PASS`);}
function requiredFile(name){
 try{const value=fs.readFileSync(name,'utf8');if(!value.trim())fail('empty file');return value;}
 catch(e){if(e.message.includes('NOT PASS'))throw e;return fail('missing file');}
}
// v64: The Vite entry alone is insufficient: a missing stylesheet, icon or
// modulepreload can make a verified Pages bundle appear broken. Check the exact
// local resources referenced by the published HTML before hashing/uploading.
function validateHtmlAssetReferences(dist,html){
 const root=path.resolve(dist);
 let checked=0;
 for(const match of html.matchAll(/<(script|link|img|source)\b([^>]*?)>/gi)){
  const tag=match[1].toLowerCase(),attrs=match[2];
  const attr=name=>{
   const m=attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))`,'i'));
   return m?(m[1]??m[2]??m[3]):null;
  };
  const rel=String(attr('rel')||'').toLowerCase().split(/\s+/);
  const relevant=tag==='script'||tag==='img'||tag==='source'||(tag==='link'&&
    rel.some(x=>['stylesheet','icon','modulepreload','apple-touch-icon','manifest','preload','mask-icon'].includes(x)));
  if(!relevant)continue;
  const raw=attr(tag==='link'?'href':'src');
  const srcset=tag==='img'||tag==='source'?attr('srcset'):null;
  if(!raw){if(tag==='script' && !attr('src'))continue;if(!srcset)fail('required HTML asset URL missing');}
  const refs=[];
  if(raw)refs.push(raw);
  if(srcset){
   // A production srcset is a comma-delimited list of URL + density/width.
   for(const item of srcset.split(',')){
    const ref=item.trim().split(/\s+/,1)[0];
    if(!ref)fail('empty responsive-image URL');
    refs.push(ref);
   }
  }
  for(const ref of refs){
   if(ref.startsWith('https://')){
    if(tag==='script'||rel.includes('modulepreload')||rel.includes('manifest'))
     fail('remote executable script or manifest');
    continue;
   }
   if(!ref.startsWith('/USTARA-New/'))fail('publish HTML local resource missing Pages base prefix');
   let relative;
   try{relative=decodeURIComponent(ref.slice('/USTARA-New/'.length).split(/[?#]/,1)[0]);}
   catch{fail('invalid encoded asset URL');}
   if(!relative||relative.startsWith('/')||relative.includes('\\')||
       /%(?:2e|2f|5c)/i.test(relative)||
       relative.split('/').some(part=>!part||part==='.'||part==='..'||part.startsWith('.')))
    fail('unsafe publish HTML asset reference');
   const expected=path.resolve(root,relative);
   if(!expected.startsWith(root+path.sep))fail('publish HTML asset escaped root');
   const stat=fs.lstatSync(expected,{throwIfNoEntry:false});
   if(!stat?.isFile()||stat.isSymbolicLink()||stat.size===0||
       fs.realpathSync(expected)!==expected)
    fail('referenced publish HTML resource missing, empty or symbolic link');
   checked++;
  }
 }
 if(checked<1)fail('no local published assets referenced by HTML');
 return checked;
}
function validateUstaraBootstrapAssets(dist,html){
 // Tests using minimal fake HTML aren't a real USTARA bootstrap. Real pages
 // contain this marker and must keep their three critical loading assets.
 if(!html.includes('app-loading--screen'))return 0;
 const refs=[
  /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']\/USTARA-New\/loading\.css["'][^>]*>/i,
  /<link\b[^>]*\brel=["']icon["'][^>]*\bhref=["']\/USTARA-New\/brand\/ustara\.svg["'][^>]*>/i,
  /<img\b[^>]*\bsrc=["']\/USTARA-New\/brand\/ustara\.svg["'][^>]*>/i,
  /<script\b[^>]*\bdefer\b[^>]*\bsrc=["']\/USTARA-New\/bootstrap-locale\.js["'][^>]*><\/script>/i
 ];
 for(const re of refs)if(!re.test(html))fail('required USTARA bootstrap link missing or off-base');
 if([...html.matchAll(/<script\b[^>]*\bsrc=["']\/USTARA-New\/bootstrap-locale\.js["'][^>]*>/gi)].length!==1)fail('duplicate locale bootstrap script');
 for(const rel of ['loading.css','brand/ustara.svg','bootstrap-locale.js']){
  const full=path.join(dist,rel),stat=fs.lstatSync(full,{throwIfNoEntry:false});
  if(!stat?.isFile()||stat.isSymbolicLink()||stat.size===0||fs.realpathSync(full)!==path.resolve(full))
   fail('required USTARA bootstrap resource missing or unsafe');
 }
 if(!/id=["']ustara-boot-status["']/.test(html)||! /id=["']ustara-boot-detail["']/.test(html))fail('localized bootstrap placeholders missing');
 return refs.length;
}
function validateBuiltFrontend(dist){
 const html=requiredFile(path.join(dist,'index.html'));
 validateUstaraBootstrapAssets(dist,html);
 validateHtmlAssetReferences(dist,html);
 validateCssResources(dist,html);
 validateManifestResources(dist,html);
 validateJsChunkReferences(dist);
 const expected='/USTARA-New/assets/';
 const paths=[...html.matchAll(/\bsrc=["'](\/USTARA-New\/assets\/[^"']+\.js)["']/g)].map(m=>m[1]);
 if(paths.length<1)fail('missing compiled frontend JS entry');
 for(const uri of paths){
  const filename=uri.slice(expected.length);
  if(!/^[a-zA-Z0-9._-]+\.js$/.test(filename))fail('invalid frontend entry path');
  const target=path.join(dist,'assets',filename);
  if(!fs.statSync(target,{throwIfNoEntry:false})?.isFile()||
     fs.realpathSync(target)!==path.resolve(target)||fs.statSync(target).size===0)
   fail('frontend asset missing, symlink or empty');
 }
 return paths.length;
}
// Prevent accidental publication of secrets, source maps, symlinks and
// untracked build trees. This does not replace live browser testing.
function validatePublishTree(dist){
 const rootStat=fs.lstatSync(dist);
 if(!rootStat.isDirectory()||rootStat.isSymbolicLink())fail('untrusted publish root');
 let count=0,totalBytes=0;
 const visit=(dir,depth)=>{
  if(depth>14)fail('publish tree nesting exceeded');
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   const name=entry.name;
   // Allow GitHub Pages .nojekyll marker only. Reject unknown hidden files,
   // backup/config files, any case of source maps, and shell/config secrets.
   if((name.startsWith('.')&&name!=='.nojekyll')||
      /^(?:node_modules|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i.test(name)||
      /\.(?:map|pem|key|p12|pfx|sql|sqlite|bak|log)$/i.test(name))
    fail('sensitive publish artifact');
   const full=path.join(dir,name);
   const st=fs.lstatSync(full);
   if(st.isSymbolicLink()||(!st.isFile()&&!st.isDirectory()))fail('untrusted publish file type');
   if(st.isDirectory()){if(name==='.nojekyll')fail('invalid marker');visit(full,depth+1);}
   else {
    if(st.size>25*1024*1024)fail('oversized publish file');
    totalBytes+=st.size;
    if(totalBytes>120*1024*1024)fail('oversized publish tree');
    count++;if(count>30000)fail('publish tree file-count exceeded');
   }
  }
 };
 visit(dist,0);
 if(count<2)fail('no compiled publish tree');
 return count;
}


// v62: cryptographic identity for the exact publish tree, including hidden allowed
// markers and the SPA fallback. Paths are POSIX-relative and sorted by codepoint.
// The existing publish-tree guards apply first (no links, secrets, huge files).
function sha256PublishTree(dist){
 validatePublishTree(dist);
 const files=[];
 const walk=(dir,relative='')=>{
  for(const name of fs.readdirSync(dir).sort()){
   const full=path.join(dir,name);
   const rel=relative?relative+'/'+name:name;
   const stat=fs.lstatSync(full);
   if(stat.isDirectory())walk(full,rel);
   else {
    if(!stat.isFile()||stat.isSymbolicLink())fail('invalid publish tree entry');
    const data=fs.readFileSync(full);
    files.push([rel, data.length, crypto.createHash('sha256').update(data).digest('hex')]);
   }
  }
 };
 walk(dist);
 return crypto.createHash('sha256').update(JSON.stringify(files),'utf8').digest('hex');
}

function verifyPagesOutput(dist){
 const html=requiredFile(path.join(dist,'index.html'));
 const fallback=requiredFile(path.join(dist,'404.html'));
 if(html!==fallback)fail('SPA fallback is different from index');
 const assets=validateBuiltFrontend(dist);
 const files=validatePublishTree(dist);
 if(assets<1||files<3)fail('incomplete Pages build');
 return {assets,files};
}
module.exports={validateBuiltFrontend,validateHtmlAssetReferences,validateUstaraBootstrapAssets,validatePublishTree,verifyPagesOutput,sha256PublishTree};
