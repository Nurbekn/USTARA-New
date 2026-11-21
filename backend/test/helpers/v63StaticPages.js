"use strict";
// Serves only verified local Vite dist bytes to a loopback test browser.
// Never proxies /api or opens an external listening socket.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
 '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
 '.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf',
 '.webmanifest':'application/manifest+json','.avif':'image/avif','.gif':'image/gif','.ico':'image/x-icon'};
function lookupPath(dist,raw){
 if(typeof raw!=='string'||raw.length>4096||/[\\\x00-\x1f]/.test(raw))return null;
 const pathname=raw.split(/[?#]/,1)[0];
 let decoded;try{decoded=decodeURIComponent(pathname);}catch{return null;}
 if(!decoded.startsWith('/USTARA-New/')||decoded.includes('\\')||
    decoded.split('/').some(x=>x==='.'||x==='..'))return null;
 const rel=decoded.slice('/USTARA-New/'.length);
 if(rel.startsWith('/')||rel.includes('//')||rel.split('/').some(x=>x.startsWith('.')))return null;
 const ext=path.posix.extname(rel);
 const candidate=rel===''?'index.html':ext?rel:'404.html';
 const full=path.resolve(dist,candidate);
 if(!full.startsWith(path.resolve(dist)+path.sep))return null;
 try{const st=fs.lstatSync(full);if(!st.isFile()||st.isSymbolicLink())return null;}
 catch{return null;}
 return {full,type:TYPES[path.extname(full).toLowerCase()]||'application/octet-stream'};
}
function servePages(dist){
 const server=http.createServer((req,res)=>{
  const data=req.method==='GET'?lookupPath(dist,req.url):null;
  if(!data){res.writeHead(404,{'Cache-Control':'no-store'});res.end('Not found');return;}
  fs.readFile(data.full,(err,bytes)=>{
   if(err){res.writeHead(404);res.end('Not found');return;}
   res.writeHead(200,{'Content-Type':data.type,'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Content-Security-Policy':
      "default-src 'self' data: blob:; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'"});
   res.end(bytes);
  });
 });
 return new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{
   server.off('error',reject);
   resolve({url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise((ok,no)=>server.close(e=>e?no(e):ok()))});
  });
 });
}
module.exports={lookupPath,servePages};
