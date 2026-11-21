'use strict';
const {Pool}=require('pg');
const {createPoolConfig}=require('../database/poolConfig');
const {createTelegramApi}=require('./api');
const {createQueueTelegramDispatcher}=require('../services/queueTelegramNotifications');
const {setTimeout:delay}=require('node:timers/promises');
async function runQueueNotifications({pool,api,signal}){
 const worker=createQueueTelegramDispatcher({pool,api});
 while(!signal?.aborted){
  let didWork=false;
  try{didWork=await worker.step();}
  catch{console.error('Queue notification delivery worker: transient database error');}
  if(!didWork)try{await delay(3000,undefined,{signal});}catch{break;}
 }
}
async function main(){
 const pool=new Pool({...createPoolConfig(process.env),max:2,connectionTimeoutMillis:5000,query_timeout:12000});
 const controller=new AbortController(),stop=()=>controller.abort();
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{await runQueueNotifications({pool,api:createTelegramApi(process.env.TELEGRAM_BOT_TOKEN),signal:controller.signal});}
 finally{await pool.end();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(require.main===module)main().catch(()=>{console.error('Queue notification worker stopped');process.exitCode=1;});
module.exports={runQueueNotifications};
