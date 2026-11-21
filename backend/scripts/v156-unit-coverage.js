'use strict';
// v156: structural and TAP completeness gate for the TWO FULL unit suites.
// No npm packages, database, network, secrets, or false production claims.
const fs=require('node:fs');
const path=require('node:path');
const {parseTapSummary}=require('./v40-staging');
const PROJECT=path.resolve(__dirname,'../..');
// Floors are based on the full v155 on-disk test inventory and TAP transcript,
// NOT on individual successful tests or an inferred production release.
const FLOORS=Object.freeze({
 backend:Object.freeze({dir:'backend',suffix:'.unit.test.js',minFiles:161,minTests:1501,
  script:'node --test test/*.unit.test.js',log:'backend.tap'}),
 frontend:Object.freeze({dir:'frontend',suffix:'.test.js',minFiles:114,minTests:1609,
  script:'node --test test/*.test.js',log:'frontend.tap'})
});
function fail(){throw Error('v156: incomplete or unsafe full unit-test evidence; NOT PASS');}
function safeRegular(file,root,max=8_000_000){
 const base=fs.realpathSync(root);
 const pathname=path.resolve(file);
 if(!pathname.startsWith(base+path.sep))fail();
 let st;
 try{st=fs.lstatSync(pathname);}catch{fail();}
 if(!st.isFile()||st.isSymbolicLink()||st.size===0||st.size>max||
    fs.realpathSync(pathname)!==pathname)fail();
 return pathname;
}
function verifySourceMatrix(projectRoot=PROJECT){
 const root=fs.realpathSync(projectRoot),result={};
 for(const [kind,rule] of Object.entries(FLOORS)){
  const packageDir=path.join(root,rule.dir),testDir=path.join(packageDir,'test');
  if(!fs.statSync(packageDir).isDirectory()||!fs.statSync(testDir).isDirectory()||
     fs.realpathSync(testDir)!==testDir)fail();
  const pkg=JSON.parse(fs.readFileSync(safeRegular(path.join(packageDir,'package.json'),root),'utf8'));
  if(pkg.scripts?.test!=='npm run test:unit'||pkg.scripts?.['test:unit']!==rule.script)fail();
  const files=fs.readdirSync(testDir).filter(x=>x.endsWith(rule.suffix));
  if(files.length<rule.minFiles)fail();
  for(const name of files){
   if(name==='.'||name==='..'||name.includes('/')||name.includes('\\'))fail();
   safeRegular(path.join(testDir,name),root,1_000_000);
  }
  result[kind]={testFiles:files.length,minTestFiles:rule.minFiles,minimumTapTests:rule.minTests,
   scriptVerified:true};
 }
 return {version:'v156',sourceMatrix:'PASS',runtimeSuites:'NOT_INFERRED',
  productionReady:false,...result};
}
function verifyFullUnitCoverage({projectRoot=PROJECT,logsDir}={}){
 const source=verifySourceMatrix(projectRoot);
 if(!logsDir||typeof logsDir!=='string')fail();
 const base=fs.realpathSync(logsDir);
 const full={};
 for(const [kind,rule] of Object.entries(FLOORS)){
  const log=fs.readFileSync(safeRegular(path.join(base,rule.log),base),'utf8');
  let result;
  try{result=parseTapSummary(log);}catch{fail();}
  if(result.tests<rule.minTests||result.pass!==result.tests||result.skipped!==0||
      result.fail!==0||result.cancelled!==0||result.todo!==0)fail();
  full[kind]={testFiles:source[kind].testFiles,tests:result.tests,pass:result.pass,
   minimumExpected:rule.minTests,status:'PASS'};
 }
 return {version:'v156',coverageGate:'PASS',backend:full.backend,frontend:full.frontend,
  databaseE2E:'NOT_INFERRED',browserE2E:'NOT_INFERRED',productionReady:false};
}
if(require.main===module){
 try{
  const result=process.argv.includes('--source-only')?verifySourceMatrix():
   verifyFullUnitCoverage({logsDir:process.argv[2]});
  console.log(JSON.stringify(result,null,2));
 }catch{console.error('v156: full unit-test matrix NOT VERIFIED');process.exitCode=1;}
}
module.exports={FLOORS,verifySourceMatrix,verifyFullUnitCoverage};
