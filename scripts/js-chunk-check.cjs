'use strict';
// v66: a compiled Vite entry may load additional chunks or URL resources that
// are absent even when index.html and its direct dependencies are intact.
// Only inspect references statically present in the emitted local JS bundles.
const fs=require('node:fs');
const path=require('node:path');
function fail(){throw new Error('v66: missing or unsafe compiled JS dependency; NOT PASS');}
const JS_EXT=/\.(?:js|css|json|svg|png|jpe?g|webp|gif|avif|ico|woff2?|ttf)$/i;
function resolveChunkRef(root,source,raw){
 if(typeof raw!=='string'||!raw||raw.length>1024||/[\\\x00-\x1f]/.test(raw))fail();
 const url=raw.split(/[?#]/,1)[0];
 let decoded;try{decoded=decodeURIComponent(url);}catch{fail();}
 if(!decoded||/%(?:2e|2f|5c)/i.test(decoded)||/[\\\x00-\x1f]/.test(decoded))fail();
 if(/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(decoded))fail();
 let target;
 if(decoded.startsWith('/')){
  if(!decoded.startsWith('/USTARA-New/'))fail();
  target=path.resolve(root,decoded.slice('/USTARA-New/'.length));
 }else if(decoded.startsWith('./')||decoded.startsWith('../'))target=path.resolve(path.dirname(source),decoded);
 else return null; // bare module specifiers are not file paths
 if(!target.startsWith(root+path.sep)||!JS_EXT.test(target)||
    target.slice(root.length+1).split(path.sep).some(part=>part.startsWith('.')))fail();
 const stat=fs.lstatSync(target,{throwIfNoEntry:false});
 if(!stat?.isFile()||stat.isSymbolicLink()||stat.size===0||fs.realpathSync(target)!==target)fail();
 return target;
}
function validateJsChunkReferences(dist){
 const root=path.resolve(dist),assets=path.join(root,'assets');
 if(!fs.lstatSync(assets,{throwIfNoEntry:false})?.isDirectory())fail();
 const visited=new Set();let checked=0;
 const visit=file=>{
  if(visited.has(file))return;
  visited.add(file);
  if(visited.size>500)fail();
  const stat=fs.lstatSync(file,{throwIfNoEntry:false});
  if(!stat?.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024||fs.realpathSync(file)!==file)fail();
  const body=fs.readFileSync(file,'utf8');
  const refs=[];
  // Static/dynamic ESM imports and re-exports, emitted by Vite for lazy pages.
  for(const m of body.matchAll(/\b(?:import|export)\s*(?:\(\s*|(?:\{[^}\r\n]{0,300}\}|\*[^;\r\n]{0,100}|[A-Za-z_$][\w$]{0,70})\s*from\s*|)(["'])([^"'\r\n]+)\1\s*\)?/g))refs.push(m[2]);
  // Bundled new URL('./image.svg', import.meta.url) asset references.
  for(const m of body.matchAll(/\bnew\s+URL\(\s*(["'])([^"'\r\n]+)\1\s*,\s*import\.meta\.url\s*\)/g))refs.push(m[2]);
  for(const raw of refs){
   // A bare name such as `react` is not a relative built asset.
   if(!/^(?:\.{1,2}\/|\/|[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw))continue;
   const target=resolveChunkRef(root,file,raw);
   if(target){checked++;if(target.endsWith('.js'))visit(target);}
  }
 };
 function walk(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
   const full=path.join(directory,entry.name);
   if(entry.isSymbolicLink())fail();
   if(entry.isDirectory())walk(full);
   else if(entry.name.endsWith('.js'))visit(full);
  }
 }
 walk(assets);
 if(visited.size<1)fail();
 return {scripts:visited.size,dependencies:checked};
}
module.exports={resolveChunkRef,validateJsChunkReferences};
