'use strict';
// Resolve local dependencies referenced *inside* built CSS. A readable CSS
// entry does not imply that its fonts, icons and imported sheets are present.
const fs=require('node:fs');
const path=require('node:path');
function fail(){throw new Error('v65: missing or unsafe local CSS dependency; NOT PASS');}
function resolveCssRef(root,baseFile,raw){
 if(typeof raw!=='string'||!raw||/[\\\x00-\x1f]/.test(raw))fail();
 const value=raw.trim();
 if(value[0]==='#'||value.startsWith('data:'))return null;
 if(/^https:\/\//i.test(value))return null; // External fonts: no local guarantee.
 if(/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value))fail();
 const fragmentless=value.split(/[?#]/,1)[0];
 let decoded;try{decoded=decodeURIComponent(fragmentless);}catch{fail();}
 if(!decoded||/[\\\x00-\x1f]/.test(decoded)||/%(?:2e|2f|5c)/i.test(decoded))fail();
 let full;
 if(decoded[0]==='/'){
  if(!decoded.startsWith('/USTARA-New/'))fail();
  full=path.resolve(root,decoded.slice('/USTARA-New/'.length));
 }else full=path.resolve(path.dirname(baseFile),decoded);
 if(!full.startsWith(root+path.sep))fail();
 const stat=fs.lstatSync(full,{throwIfNoEntry:false});
 if(!stat?.isFile()||stat.isSymbolicLink()||stat.size===0||fs.realpathSync(full)!==full)fail();
 return full;
}
function validateCssResources(dist,html){
 const root=path.resolve(dist),seen=new Set();
 let count=0;
 const visit=file=>{
  if(seen.has(file))return;
  seen.add(file);
  if(seen.size>200)fail();
  const stat=fs.lstatSync(file,{throwIfNoEntry:false});
  if(!stat?.isFile()||stat.size>2*1024*1024)fail();
  const css=fs.readFileSync(file,'utf8');
  // Vite emits url(...) for bundled fonts and images; @import without url()
  // is used by plain CSS as well. Deliberately fail on malformed local links.
  const refs=[];
  for(const m of css.matchAll(/url\(\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^)'"\r\n]+))\s*\)/gi))
   refs.push(m[1]??m[2]??m[3]);
  for(const m of css.matchAll(/@import\s+(?:"([^"\r\n]+)"|'([^'\r\n]+)')/gi))refs.push(m[1]??m[2]);
  for(const ref of refs){
   const target=resolveCssRef(root,file,ref);
   if(target){count++;if(path.extname(target).toLowerCase()==='.css')visit(target);}
  }
 };
 for(const match of html.matchAll(/<link\b([^>]*?)>/gi)){
  const attrs=match[1];
  const rel=attrs.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]||'';
  if(!rel.toLowerCase().split(/\s+/).includes('stylesheet'))continue;
  const href=attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
  if(!href||/^https:\/\//i.test(href))continue;
  // For HTML the link must be local Pages-prefixed (checked separately).
  if(!href.startsWith('/USTARA-New/'))fail();
  const sheet=resolveCssRef(root,path.join(root,'index.html'),href);
  if(sheet)visit(sheet);
 }
 return {stylesheets:seen.size,dependencies:count};
}
module.exports={resolveCssRef,validateCssResources};
