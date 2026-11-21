'use strict';
// The 185 signed-off decisions are requirements, not 185 implemented features.
// Read-only inventory: no DB, network, or writes; never infer completion from
// mere row presence or a partially implemented status.
const fs=require('node:fs');
const path=require('node:path');
const defaultCsv=path.resolve(__dirname,'../../docs/USTARA_185_NAZORAT.csv');
function parseCsv(source){
 if(typeof source!=='string')throw new TypeError('CSV text expected');
 const text=source.replace(/^\uFEFF/,'');
 const rows=[];let cells=[],value='',quoted=false,closedQuote=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){
   if(ch==='"'&&text[i+1]==='"'){value+='"';i++;}
   else if(ch==='"'){quoted=false;closedQuote=true;}
   else value+=ch;
  }else if(ch==='"'){
   if(value!==''||closedQuote)throw new Error(`Unexpected CSV quote at offset ${i}`);
   quoted=true;
  }else if(ch===','){
   cells.push(value);value='';closedQuote=false;
  }else if(ch==='\n'||ch==='\r'){
   if(ch==='\r'&&text[i+1]==='\n')i++;
   cells.push(value);value='';closedQuote=false;
   if(cells.some(v=>v!==''))rows.push(cells);
   cells=[];
  }else{
   if(closedQuote)throw new Error(`CSV characters after closing quote at offset ${i}`);
   value+=ch;
  }
 }
 if(quoted)throw new Error('Unclosed CSV quote');
 if(value!==''||cells.length){cells.push(value);rows.push(cells);}
 return rows;
}
function category(status){
 if(status==='Tekshiruv kerak')return 'tekshiruv_kerak';
 if(status==='Bekor qilingan yoki keyinga qoldirilgan')return 'bekor_yoki_keyinga';
 if(status.startsWith('Qisman')||status.startsWith('Kod va unit test'))return 'qisman';
 return 'ziddiyat_yoki_aniq_emas';
}
function analyzeCsv(text){
 const parsed=parseCsv(text);
 const expected=['raqam','qaror','asosiy_bosqich','holat','dalil_yoki_izoh'];
 if(JSON.stringify(parsed[0])!==JSON.stringify(expected))throw new Error('185 register header mismatch');
 const decisions=[];
 for(const [index,fields] of parsed.slice(1).entries()){
  if(fields.length!==expected.length)throw new Error(`Decision row ${index+2}: expected ${expected.length} fields`);
  const [rawId,decision,phase,status,evidence]=fields;
  const id=Number(rawId);
  if(!Number.isSafeInteger(id)||id!==index+1||!decision.trim()||!phase.trim()||!status.trim())
   throw new Error(`Decision ${index+1}: missing, duplicated, unordered, or blank mandatory field`);
  decisions.push({id,decision,phase,status,evidence,category:category(status)});
 }
 if(decisions.length!==185)throw new Error(`Expected 185 decisions, found ${decisions.length}`);
 const totals={tekshiruv_kerak:0,qisman:0,bekor_yoki_keyinga:0,ziddiyat_yoki_aniq_emas:0};
 for(const item of decisions)totals[item.category]++;
 // The CSV does NOT demonstrate completed and production-tested features.
 return {total:decisions.length,fully_verified:0,fully_verified_proof:'not tracked in this CSV',totals,
  followup_ids:decisions.filter(x=>x.category==='ziddiyat_yoki_aniq_emas').map(x=>x.id),decisions};
}
function report(summary){
 return [
  `USTARA: ${summary.total} kelishilgan qaror ro‘yxatda. Bu funksiyalar tayyorligini tasdiqlamaydi.`,
  `Tekshiruv kerak: ${summary.totals.tekshiruv_kerak}`,
  `Qisman: ${summary.totals.qisman}`,
  `Bekor yoki keyinga: ${summary.totals.bekor_yoki_keyinga}`,
  `Nomuvofiqlik/aniq emas: ${summary.totals.ziddiyat_yoki_aniq_emas} (#${summary.followup_ids.join(', #')})`,
  'Production/E2E tasdiqlanganlar soni ushbu reyestrda belgilanmagan; 0 deb xulosa chiqarmang.'
 ].join('\n');
}
if(require.main===module){
 try{
  const summary=analyzeCsv(fs.readFileSync(defaultCsv,'utf8'));
  if(process.argv.includes('--json'))process.stdout.write(JSON.stringify({...summary,decisions:undefined},null,2)+'\n');
  else process.stdout.write(report(summary)+'\n');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={parseCsv,category,analyzeCsv,report};
