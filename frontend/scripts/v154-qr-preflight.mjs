// Package-free QR route contract: deploy mount path, client payload and
// server validation must agree BEFORE CI installs dependencies.
// PASS here means source contract only; no QR was scanned in a browser.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {qrSiteDestination,SUPPORTED_QR_BASES,SUPPORTED_QR_LANGUAGES} from '../src/pages/barber/data/v154QrSiteDestination.js';
const require=createRequire(import.meta.url);
const {publicQueueLink,BASE_PATHS,LANGUAGES}=require('../../backend/services/v154PublicQueueLink');
const srcRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function fail(){throw Error('v154: QR public destination contract drift; NOT PASS');}
export function verifyQrPreflight({viteConfig,queueSource,controllerSource}={}){
 const vite=viteConfig??readFileSync(path.join(srcRoot,'vite.config.js'),'utf8');
 const queue=queueSource??readFileSync(path.join(srcRoot,'src/pages/barber/Queue.jsx'),'utf8');
 const controller=controllerSource??readFileSync(path.resolve(srcRoot,'../backend/controllers/walkinQrController.js'),'utf8');
 const match=vite.match(/\bbase:\s*['"](\/[^'"\s]+)['"]/);
 if(!match||match[1]!=='/USTARA-New/'||!SUPPORTED_QR_BASES.includes(match[1])||!BASE_PATHS.includes(match[1]))fail();
 if(JSON.stringify(SUPPORTED_QR_BASES)!==JSON.stringify(BASE_PATHS) ||
    JSON.stringify(SUPPORTED_QR_LANGUAGES)!==JSON.stringify(LANGUAGES))fail();
 if(!queue.includes('qrSiteDestination(window.location.origin,import.meta.env.BASE_URL,lang)')||
    queue.includes('body:{origin:window.location.origin}'))fail();
 if(!controller.includes('base_path=validBasePath(req.body?.base_path)')||
    !controller.includes('lang=req.body?.lang;validLanguage(lang)')||
    !controller.includes('const url=publicQueueLink(origin,raw,{base_path,lang})')||
    !controller.includes('CORS_ALLOWED_ORIGINS'))fail();
 const token='c'.repeat(48),origin='https://nurbekn.github.io';
 for(const lang of LANGUAGES){
  const request=qrSiteDestination(origin,match[1],lang);
  if(publicQueueLink(request.origin,token,request)!==`${origin}/USTARA-New/queue/check-in/${token}?lang=${lang}`)fail();
 }
 if(publicQueueLink('http://localhost:5173',token)!==`http://localhost:5173/queue/check-in/${token}`)fail();
 return {status:'PASS_SOURCE_CONTRACT_ONLY',basePath:match[1],locales:LANGUAGES,
  originPolicy:'preserved',database:'NOT_RUN',browserScan:'NOT_RUN',viteBuild:'NOT_RUN',productionReady:false};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{const result=verifyQrPreflight();
  console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):`v154 QR contract PASS (source only): ${result.basePath}`);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
