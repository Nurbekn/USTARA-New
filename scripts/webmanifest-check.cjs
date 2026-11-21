'use strict';
// v66: PWA manifests can link missing icons/screenshots not visible in HTML.
// Check only packaged, same-origin Pages resources; do not fetch remote URLs.
const fs=require('node:fs');
const path=require('node:path');
function fail(){throw new Error('v66: missing or unsafe webmanifest resource; NOT PASS');}
function resolveManifestAsset(root,manifestFile,raw){
 if(typeof raw!=='string'||raw.length<1||raw.length>1024||/[\\\x00-\x1f]/.test(raw))fail();
 const ref=raw.split(/[?#]/,1)[0];
 let value;try{value=decodeURIComponent(ref);}catch{fail();}
 if(!value||/%(?:2e|2f|5c)/i.test(value)||/[\\\x00-\x1f]/.test(value)||
    /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value))fail();
 let target;
 if(value.startsWith('/')){
  if(!value.startsWith('/USTARA-New/'))fail();
  target=path.resolve(root,value.slice('/USTARA-New/'.length));
 }else target=path.resolve(path.dirname(manifestFile),value);
 if(!target.startsWith(root+path.sep)||
    target.slice(root.length+1).split(path.sep).some(part=>!part||part.startsWith('.')))fail();
 const stat=fs.lstatSync(target,{throwIfNoEntry:false});
 if(!stat?.isFile()||stat.isSymbolicLink()||stat.size===0||fs.realpathSync(target)!==target)fail();
 return target;
}
function validateManifestResources(dist,html){
 const root=path.resolve(dist);let manifests=0,assets=0;
 for(const m of String(html).matchAll(/<link\b([^>]*?)>/gi)){
  const rel=m[1].match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]||'';
  if(!rel.toLowerCase().split(/\s+/).includes('manifest'))continue;
  manifests++;if(manifests>2)fail();
  const href=m[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
  if(!href||!href.startsWith('/USTARA-New/'))fail();
  const manifest=resolveManifestAsset(root,path.join(root,'index.html'),href);
  const st=fs.statSync(manifest);if(st.size>128*1024)fail();
  let info;try{info=JSON.parse(fs.readFileSync(manifest,'utf8'));}catch{fail();}
  if(!info||typeof info!=='object'||Array.isArray(info))fail();
  const refs=[];
  for(const collection of [info.icons,info.screenshots]){
   if(collection!==undefined && (!Array.isArray(collection)||collection.length>100))fail();
   for(const item of collection||[]){if(!item||typeof item!=='object')fail();refs.push(item.src);}
  }
  if(info.shortcuts!==undefined&&(!Array.isArray(info.shortcuts)||info.shortcuts.length>30))fail();
  for(const shortcut of info.shortcuts||[]){
   if(shortcut.icons!==undefined&&(!Array.isArray(shortcut.icons)||shortcut.icons.length>20))fail();
   for(const icon of shortcut.icons||[])refs.push(icon?.src);
  }
  for(const ref of refs){resolveManifestAsset(root,manifest,ref);assets++;}
 }
 return {manifests,assets};
}
module.exports={resolveManifestAsset,validateManifestResources};
