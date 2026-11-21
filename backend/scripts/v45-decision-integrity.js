'use strict';
// Baseline of the user's 185 agreed decisions. Change only after an explicit
// decision review, and never infer feature completion from this checksum.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {analyzeCsv}=require('./decision-coverage');
const ACCEPTED_SHA256='bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71';
function verify(file=path.resolve(__dirname,'../../docs/USTARA_185_NAZORAT.csv')){
 const bytes=fs.readFileSync(file),actual=crypto.createHash('sha256').update(bytes).digest('hex');
 const summary=analyzeCsv(bytes.toString('utf8'));
 if(actual!==ACCEPTED_SHA256)throw new Error('v45: 185 decision register changed without explicit approval');
 return {decisions:summary.total,sha256:actual,status:'integrity_verified_not_feature_complete'};
}
if(require.main===module){try{console.log(JSON.stringify(verify(),null,2));}
 catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={verify,ACCEPTED_SHA256};
