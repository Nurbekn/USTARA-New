'use strict';
const {Pool}=require('pg');
const {createPoolConfig}=require('../database/poolConfig');
const {createSmartBookingTelegram}=require('../services/smartBookingTelegram');
const {setTimeout:delay}=require('node:timers/promises');
async function work({pool,api,signal}){
 const service=createSmartBookingTelegram({pool,api});
 while(!signal?.aborted){
  try{const had=await service.step();if(!had)await delay(3000,undefined,{signal});}
  catch(e){console.error('Smart offer Telegram delivery failure:',e.code||'unknown');
   try{await delay(5000,undefined,{signal});}catch{break;}}
 }
}
async function main(){
 const pool=new Pool({...createPoolConfig(process.env),max:2,connectionTimeoutMillis:5000,query_timeout:12000});
 const abort=new AbortController(),stop=()=>abort.abort();
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{await work({pool,signal:abort.signal});}
 finally{await pool.end();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(require.main===module)main().catch(()=>{console.error('Smart offer Telegram dispatcher stopped');process.exitCode=1;});
module.exports={work};
