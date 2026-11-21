// USTARA v152 — execute the REAL public first-paint script in an isolated
// DOM-like VM. This is a browserless smoke gate, NOT a Chrome or Vite test.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {checkPagesSource} from './v150-pages-source-check.mjs';
import {DOCUMENT_COPY} from '../src/utils/documentLocale.js';

const FRONTEND=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fail=message=>{throw new Error(`v152 first-paint: ${message}; NOT PASS`);};
export function executeFirstPaint(frontendRoot=FRONTEND,query='?lang=uz'){
  const root=path.resolve(frontendRoot);
  checkPagesSource(root);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const script=fs.readFileSync(path.join(root,'public/bootstrap-locale.js'),'utf8');
  if(html.indexOf('bootstrap-locale.js')>html.indexOf('/src/main.jsx'))
    fail('locale script must precede React entry');
  const status={textContent:'__untranslated__'};
  const detail={textContent:'__untranslated__'};
  const meta={value:null,setAttribute(name,value){
    if(name!=='content'||typeof value!=='string')fail('unsafe meta write');
    this.value=value;
  }};
  const document={
    documentElement:{lang:'__unset__'},title:'__unset__',
    querySelector(selector){return selector==='meta[name="description"]'?meta:null;},
    getElementById(id){return id==='ustara-boot-status'?status:
      id==='ustara-boot-detail'?detail:null;},
  };
  vm.runInNewContext(script,{document,location:{search:query},URLSearchParams,Object},
    {timeout:1200,filename:'bootstrap-locale.js'});
  return {lang:document.documentElement.lang,title:document.title,
    description:meta.value,status:status.textContent,detail:detail.textContent};
}
export function verifyFirstPaint(frontendRoot=FRONTEND){
  const expectations=[
    ['?lang=uz','uz','Yuklanmoqda…','Iltimos, biroz kuting'],
    ['?lang=ru','ru','Загрузка…','Пожалуйста, подождите'],
    ['?lang=en','en','Loading…','Please wait'],
    ['?lang=__proto__','uz','Yuklanmoqda…','Iltimos, biroz kuting'],
    ['?lang=ru&lang=en','uz','Yuklanmoqda…','Iltimos, biroz kuting'],
    ['?lang=%3Cscript%3Ealert(1)%3C%2Fscript%3E','uz','Yuklanmoqda…','Iltimos, biroz kuting'],
  ];
  for(const [query,lang,status,detail] of expectations){
    const value=executeFirstPaint(frontendRoot,query);
    if(value.lang!==lang||value.status!==status||value.detail!==detail||
       value.title!==DOCUMENT_COPY[lang].title||
       value.description!==DOCUMENT_COPY[lang].description)
      fail(`locale mismatch or unsafe output for ${lang}`);
  }
  return {checks:expectations.length,result:'PASS',kind:'BROWSERLESS_VM_NOT_CHROME'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  try{const out=verifyFirstPaint();
    console.log(process.argv.includes('--json')?JSON.stringify(out):
      `v152 first-paint ${out.checks}/${out.checks} PASS (browserless VM only)`);
  }catch(e){console.error(e.message);process.exitCode=1;}
}
