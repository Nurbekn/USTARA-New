'use strict';
// Validate the immutable 185-decision source without treating tests as feature completion.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const EXPECTED_SHA = 'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71';
const HEADERS = ['raqam','qaror','asosiy_bosqich','holat','dalil_yoki_izoh'];
function parseCsv(input) {
  if (typeof input !== 'string') throw Error('v67: invalid CSV input');
  const rows=[];let row=[],field='',quoted=false,afterQuote=false;
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(quoted){
      if(c==='"') {if(input[i+1]==='"'){field+='"';i++;}else {quoted=false;afterQuote=true;}}
      else field+=c;
    } else if(afterQuote){
      if(c===','){row.push(field);field='';afterQuote=false;}
      else if(c==='\n'||c==='\r'){
        row.push(field);rows.push(row);row=[];field='';afterQuote=false;
        if(c==='\r'&&input[i+1]==='\n')i++;
      }else if(c!==' '&&c!=='\t')throw Error('v67: unexpected character after quoted field');
    } else if(c==='"') {
      if(field)throw Error('v67: quote inside bare field');
      quoted=true;
    } else if(c===','){row.push(field);field='';}
    else if(c==='\r'||c==='\n'){
      row.push(field);rows.push(row);row=[];field='';
      if(c==='\r'&&input[i+1]==='\n')i++;
    }else field+=c;
  }
  if(quoted)throw Error('v67: unclosed quote');
  if(field||row.length||afterQuote){row.push(field);rows.push(row);}
  return rows;
}
function audit(input,{shaRequired=true}={}) {
  const sha=crypto.createHash('sha256').update(input).digest('hex');
  if(shaRequired&&sha!==EXPECTED_SHA)throw Error('v67: decision source checksum mismatch');
  const rows=parseCsv(input.toString('utf8').replace(/^\uFEFF/,''));
  if(JSON.stringify(rows.shift())!==JSON.stringify(HEADERS))throw Error('v67: CSV columns changed');
  if(rows.length!==185)throw Error(`v67: expected 185 decisions, got ${rows.length}`);
  const counts={needs_verification:0,partial:0,deferred_or_cancelled:0,open:0};
  const phases={};
  for(let i=0;i<rows.length;i++){
    const [number,title,phase,status,...rest]=rows[i];
    if(rows[i].length!==HEADERS.length||Number(number)!==i+1||!title.trim())throw Error(`v67: decision row ${i+1} is invalid`);
    if(!/^\d+$/.test(phase)||Number(phase)<1||Number(phase)>10)throw Error(`v67: invalid phase on ${number}`);
    const s=status.trim().toLowerCase();
    if(s==='tekshiruv kerak')counts.needs_verification++;
    else if(s.startsWith('qisman')||s.includes('qisman'))counts.partial++;
    else if(/bekor|kechiktirilgan/.test(s))counts.deferred_or_cancelled++;
    else if(/ochiq|hal qilinmagan|topilmadi/.test(s))counts.open++;
    else throw Error(`v67: unexpected status for decision ${number}: ${status}`);
    phases[phase]=(phases[phase]||0)+1;
  }
  return {total:rows.length,checksum:sha,status:counts,by_phase:phases,fully_verified:0,
    note:'These are historical statuses, not proof that features are implemented or production-tested'};
}
if(require.main===module){try{
  const file=path.join(__dirname,'../docs/USTARA_185_NAZORAT.csv');
  const result=audit(fs.readFileSync(file));console.log(JSON.stringify(result,null,2));
}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={parseCsv,audit,EXPECTED_SHA};
