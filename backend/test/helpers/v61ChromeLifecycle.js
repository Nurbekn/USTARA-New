'use strict';
// Test-only lifecycle: no shell and no external debugging listener.
const CHROME_BINARIES=new Set(['google-chrome','chromium','chromium-browser']);
function chromeBinary(env=process.env){
 const candidate=env.USTARA_CHROME_BINARY||'google-chrome';
 if(!CHROME_BINARIES.has(candidate))throw Error('Unsupported Chrome E2E executable');
 return candidate;
}
function chromeExited(child){
 return child.exitCode!==null || child.signalCode!==null;
}
function awaitExit(child,ms){
 if(chromeExited(child)||!child.pid)return Promise.resolve(true);
 return new Promise(resolve=>{
  let done=false;
  const finish=value=>{if(done)return;done=true;clearTimeout(timer);
   child.off('exit',finished);child.off('close',finished);child.off('error',finished);resolve(value);};
  const finished=()=>finish(true);
  const timer=setTimeout(()=>finish(false),ms);
  child.once('exit',finished);child.once('close',finished);child.once('error',finished);
  if(chromeExited(child))finish(true);
 });
}
async function stopChrome(child,{graceMs=1500,forceMs=1500}={}){
 if(!Number.isInteger(graceMs)||graceMs<1||graceMs>10000||
    !Number.isInteger(forceMs)||forceMs<1||forceMs>10000)throw Error('Invalid Chrome shutdown deadline');
 if(chromeExited(child)||!child.pid)return;
 try{child.kill('SIGTERM');}catch{}
 if(await awaitExit(child,graceMs))return;
 try{child.kill('SIGKILL');}catch{}
 if(!await awaitExit(child,forceMs))throw Error('Chrome shutdown deadline exceeded');
}
module.exports={chromeBinary,chromeExited,stopChrome};
