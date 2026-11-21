// v153: package-free, read-only, case-sensitive frontend import/asset audit.
// This is NOT a Vite build or a JSX syntax/compiler guarantee.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const JAVASCRIPT=/\.(?:js|jsx|mjs|cjs)$/;
const CSS=/\.css$/;
const IMPORT=/\b(?:import|export)\s+(?:[^'"`;]*?\s+from\s+)?(['"])([^'"\r\n]+)\1/g;
const DYNAMIC=/\bimport\s*\(\s*(['"])([^'"\r\n]+)\1\s*\)/g;
const CSS_URL=/\burl\(\s*(?:(['"])(.*?)\1|([^)]*))\s*\)/g;
const EXTENSIONS=['','.js','.jsx','.mjs','.json','.css','.svg','.png','.webp','.jpg','.jpeg'];
const fail=(message)=>{throw new Error(`v153 source graph: ${message}; NOT PASS`);};
const contained=(parent,child)=>child===parent||child.startsWith(parent+path.sep);
function exactRegularFile(filename,boundary){
 if(!contained(boundary,filename))return false;
 const rel=path.relative(boundary,filename).split(path.sep);
 let current=boundary;
 for(const part of rel){
  if(!part||part==='.'||part==='..'||!fs.existsSync(current))return false;
  if(!fs.readdirSync(current).includes(part))return false; // exact case on all platforms
  current=path.join(current,part);
  if(fs.lstatSync(current).isSymbolicLink())return false;
 }
 return fs.existsSync(current)&&fs.lstatSync(current).isFile();
}
function collectFiles(dir,boundary,result){
 if(!contained(boundary,dir)||fs.lstatSync(dir).isSymbolicLink())fail('source directory escapes or is symlinked');
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const abs=path.join(dir,entry.name);
  if(entry.isSymbolicLink())fail(`symlink under source: ${path.relative(boundary,abs)}`);
  if(entry.isDirectory())collectFiles(abs,boundary,result);
  else if(entry.isFile()&&(JAVASCRIPT.test(entry.name)||CSS.test(entry.name)))result.push(abs);
 }
}
function localImport(root,src,file,value){
 if(!value.startsWith('.'))return false;
 if(/[?#\0\\]/.test(value))fail(`unsupported relative import ${value}`);
 const target=path.resolve(path.dirname(file),value);
 if(!contained(src,target))fail(`relative import escapes src: ${path.relative(root,file)} -> ${value}`);
 const choices=EXTENSIONS.map(ext=>target+ext).concat(['index.js','index.jsx','index.mjs'].map(name=>path.join(target,name)));
 if(!choices.some(candidate=>exactRegularFile(candidate,src)))
  fail(`unresolved/case-mismatched import: ${path.relative(root,file)} -> ${value}`);
 return true;
}
function checkCssAsset(root,src,publicRoot,file,url){
 const value=url.trim();
 if(!value||value.startsWith('data:')||value.startsWith('#')||value.startsWith('var('))return false;
 if(/^https:\/\//.test(value))return false;
 if(/^[a-z]+:/i.test(value)||value.startsWith('//'))fail('unapproved CSS URL scheme');
 if(value.startsWith('/'))fail(`unbased CSS root URL: ${path.relative(root,file)} -> ${value}`);
 if(/[?#\0\\]/.test(value))fail('ambiguous CSS asset path');
 const boundary=contained(publicRoot,file)?publicRoot:src;
 const target=path.resolve(path.dirname(file),value);
 if(!exactRegularFile(target,boundary))fail(`missing CSS asset or path escapes: ${path.relative(root,file)} -> ${value}`);
 return true;
}
export function auditSourceGraph(frontendRoot=ROOT){
 const root=path.resolve(frontendRoot),src=path.join(root,'src'),publicRoot=path.join(root,'public');
 if(!fs.existsSync(src)||!fs.lstatSync(src).isDirectory()||fs.lstatSync(src).isSymbolicLink())fail('invalid src folder');
 if(!fs.existsSync(publicRoot)||!fs.lstatSync(publicRoot).isDirectory()||fs.lstatSync(publicRoot).isSymbolicLink())fail('invalid public folder');
 const files=[];collectFiles(src,src,files);collectFiles(publicRoot,publicRoot,files);
 let js=0,css=0,localImports=0,dynamicImports=0,cssAssets=0;
 for(const file of files){
  const contents=fs.readFileSync(file,'utf8');
  if(JAVASCRIPT.test(file)){
   js++;
   for(const match of contents.matchAll(IMPORT)){
    if(localImport(root,src,file,match[2]))localImports++;
   }
   for(const match of contents.matchAll(DYNAMIC)){
    if(localImport(root,src,file,match[2])){localImports++;dynamicImports++;}
   }
  }else if(CSS.test(file)){
   css++;
   for(const match of contents.matchAll(CSS_URL)){
    if(checkCssAsset(root,src,publicRoot,file,match[2]??match[3]??''))cssAssets++;
   }
   // Reject CSS @import outside url(...) as well (e.g., @import '/root.css').
   for(const match of contents.matchAll(/@import\s+(['"])([^'"\r\n]+)\1/g)){
    if(checkCssAsset(root,src,publicRoot,file,match[2]))cssAssets++;
   }
  }
 }
 if(!js)fail('no source JavaScript found');
 // This particular regression produced a broken image in the deployed home gallery.
 const galleryCss=path.join(src,'pages/user/UserHome.css');
 const galleryJs=path.join(src,'pages/user/UserHome.jsx');
 if(fs.existsSync(galleryCss)||fs.existsSync(galleryJs)){
  if(!exactRegularFile(galleryCss,src)||!exactRegularFile(galleryJs,src))fail('missing gallery source');
  const cssText=fs.readFileSync(galleryCss,'utf8');
  const jsxText=fs.readFileSync(galleryJs,'utf8');
  if(!cssText.includes('background-image: var(--uh-gallery-url, none)')||
     !jsxText.includes('import.meta.env.BASE_URL}images/haircut-views.webp')||
     !exactRegularFile(path.join(publicRoot,'images/haircut-views.webp'),publicRoot))
    fail('gallery must use Vite base URL and existing public image');
 }
 return {status:'PASS_SOURCE_GRAPH_ONLY',jsFiles:js,cssFiles:css,
   localImports,dynamicImports,localCssAssets:cssAssets,
   viteBuild:'NOT_RUN',browserE2E:'NOT_RUN',productionReady:false};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{const result=auditSourceGraph();console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):`v153: ${result.jsFiles} JS, ${result.cssFiles} CSS, ${result.localImports} imports, ${result.localCssAssets} assets verified. Vite: NOT_RUN.`);}
 catch(error){console.error(error.message);process.exitCode=1;}
}
