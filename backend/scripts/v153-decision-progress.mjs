// v153: read-only audit of the ORIGINAL 185-decision registry.
// A source code change or unit test does not turn a decision into "verified".
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const DEFAULT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../docs/USTARA_185_NAZORAT.csv');
export const ORIGINAL_SHA256='bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71';
export function parseCsv(text){
 const records=[];let row=[],cell='',quote=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quote){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quote=false;else cell+=ch;}
  else if(ch==='"'){if(cell!=='')throw Error('invalid CSV quote');quote=true;}
  else if(ch===','){row.push(cell);cell='';}
  else if(ch==='\n'||ch==='\r'){
   if(ch==='\r'&&text[i+1]==='\n')i++;
   row.push(cell);cell='';if(row.some(v=>v))records.push(row);row=[];
  }else cell+=ch;
 }
 if(quote)throw Error('unterminated CSV quote');
 if(cell||row.length){row.push(cell);if(row.some(v=>v))records.push(row);}
 return records;
}
export function summarizeDecisions(registryPath=DEFAULT,{requireOriginal=true}={}){
 const content=fs.readFileSync(registryPath);
 const sha256=crypto.createHash('sha256').update(content).digest('hex');
 if(requireOriginal&&sha256!==ORIGINAL_SHA256)throw Error('v153: registry bytes differ from agreed 185 decisions; NOT PASS');
 const rows=parseCsv(content.toString('utf8').replace(/^\ufeff/,''));
 const header=['raqam','qaror','asosiy_bosqich','holat','dalil_yoki_izoh'];
 if(JSON.stringify(rows[0])!==JSON.stringify(header))throw Error('v153: registry header mismatch; NOT PASS');
 if(rows.length!==186)throw Error('v153: registry must contain exactly 185 decisions; NOT PASS');
 const counts={verificationNeeded:0,partialEvidence:0,deferredOrCancelled:0,blockedOrUnknown:0,verifiedComplete:0};
 const examples={verificationNeeded:[],partialEvidence:[],deferredOrCancelled:[],blockedOrUnknown:[]};
 for(let i=1;i<rows.length;i++){
  const row=rows[i];
  if(row.length!==5||row[0]!==String(i)||!row[1].trim()||!row[3].trim())
   throw Error(`v153: invalid decision row ${i}; NOT PASS`);
  const status=row[3];
  let category;
  if(status==='Tekshiruv kerak')category='verificationNeeded';
  else if(status==='Bekor qilingan yoki keyinga qoldirilgan')category='deferredOrCancelled';
  else if(status.startsWith('Qisman')||status.startsWith('Kod va unit test'))category='partialEvidence';
  else category='blockedOrUnknown'; // Never silently upgrade an unrecognized status.
  counts[category]++;
  if(examples[category]?.length<5)examples[category].push(Number(row[0]));
 }
 return {total:185,sha256,originalUnchanged:sha256===ORIGINAL_SHA256,counts,
   examples,releaseReadiness:'NOT_VERIFIED',
   note:'This registry alone cannot prove production deployment or end-to-end functionality.'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{const report=summarizeDecisions();console.log(process.argv.includes('--json')?JSON.stringify(report,null,2):`v153: ${report.total} original decisions; ${report.counts.verificationNeeded} awaiting verification, ${report.counts.partialEvidence} partial, ${report.counts.deferredOrCancelled} deferred, ${report.counts.blockedOrUnknown} blocked/unknown. Production NOT_VERIFIED.`);}
 catch(error){console.error(error.message);process.exitCode=1;}
}
