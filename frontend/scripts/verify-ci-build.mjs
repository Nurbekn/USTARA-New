// v62: deploy the EXACT binary files tested and built by upstream CI.
// Do not recompile in Pages; reject a single changed byte, deleted or added file.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';
import {verifyPagesEvidence} from './verify-pages-evidence.mjs';
const require=createRequire(import.meta.url);
const {verifyPagesOutput,sha256PublishTree}=require('../../scripts/publish-tree-check.cjs');
export function verifyCiBuild(record,dist,provenance){
 verifyPagesEvidence(record,provenance);
 const {assets,files}=verifyPagesOutput(dist);
 const digest=sha256PublishTree(dist);
 if(digest!==record.publishTreeSha256 || files!==record.publishFiles ||
    assets!==record.frontendJsAssets)
  throw new Error('v62: CI publish artifact differs from verified release evidence; NOT PASS');
 return {digest,assets,files};
}
if(process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{
  const raw=readFileSync(process.argv[2]);
  if(raw.length>16384)throw new Error('oversized CI report');
  const record=JSON.parse(raw.toString('utf8'));
  verifyCiBuild(record,path.resolve(process.argv[3]),{
   sha:process.env.VERIFIED_SHA,apiBaseUrl:process.env.VITE_API_BASE_URL,
   runId:process.env.VERIFIED_RUN_ID,runAttempt:process.env.VERIFIED_RUN_ATTEMPT
  });
  console.log('v62: exact upstream CI build verified (SHA-256), no Pages rebuild');
 }catch{console.error('v62: upstream artifact invalid or changed; NOT PASS');process.exitCode=1;}
}
