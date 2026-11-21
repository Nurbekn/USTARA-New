// Verify that a Pages build uses exactly the config checked by upstream CI.
// This consumes only the REDACTED diagnostic artifact for a trusted push/main run.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {apiBaseSha256} from './validate-production-api.mjs';
export function verifyPagesEvidence(record,{sha,apiBaseUrl,runId,runAttempt}) {
  const fail=()=>{throw new Error('v57: upstream CI evidence or API configuration mismatch; NOT PASS');};
  if(!/^[a-f0-9]{40}$/.test(sha||''))fail();
  if(!/^[1-9][0-9]{0,15}$/.test(String(runId||'')) ||
     !/^[1-9][0-9]{0,5}$/.test(String(runAttempt||'')) ||
     !Number.isSafeInteger(Number(runId)) || !Number.isSafeInteger(Number(runAttempt)))fail();
  let hash;try{hash=apiBaseSha256(apiBaseUrl);}catch{fail();}
  if(!record || typeof record!=='object' || Array.isArray(record) ||
     record.releaseGate!=='PASS' || record.productionReady!==false ||
     record.sourceSha!==sha || record.apiBaseSha256!==hash ||
     record.sourceRunId!==Number(runId) || record.sourceRunAttempt!==Number(runAttempt) ||
     (typeof record.publishTreeSha256!=='string' || !/^[a-f0-9]{64}$/.test(record.publishTreeSha256)) ||
     record.backend?.status!=='PASS' || record.frontend?.status!=='PASS' ||
     record.postgres?.status!=='PASS' || record.postgres?.suites!==9 ||
     record.browser?.status!=='PASS' || record.browser?.tests!==4 ||
     record.publishedBrowser?.status!=='PASS' || record.publishedBrowser?.tests!==4 ||
     record.viteBuild!=='ARTIFACT_VERIFIED') fail();
  return true;
}
if(process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1])) {
  try {
    const file=readFileSync(process.argv[2]);
    if(file.length>16384)throw new Error('oversized CI evidence');
    const obj=JSON.parse(file.toString('utf8'));
    verifyPagesEvidence(obj,{sha:process.env.VERIFIED_SHA,apiBaseUrl:process.env.VITE_API_BASE_URL,
     runId:process.env.VERIFIED_RUN_ID,runAttempt:process.env.VERIFIED_RUN_ATTEMPT});
    console.log('v57: upstream CI verified commit and API configuration');
  }catch{console.error('v57: upstream evidence missing, invalid or mismatched; NOT PASS');process.exitCode=1;}
}
