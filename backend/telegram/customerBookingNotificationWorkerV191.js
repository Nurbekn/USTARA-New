'use strict';
const {setTimeout:delay}=require('node:timers/promises');
const {createCustomerBookingDispatcher}=require('../services/customerBookingTelegramV191');
async function run({pool,api,signal}){
  const worker=createCustomerBookingDispatcher({pool,api});
  while(!signal?.aborted){
    let worked=false;
    try{worked=await worker.step();}
    catch{console.error('Customer Telegram notification worker: database unavailable');}
    if(!worked)try{await delay(3000,undefined,{signal});}catch{break;}
  }
}
async function main(){
  if(process.env.ENABLE_CUSTOMER_BOOKING_NOTICE_WORKER!=='yes'){
    console.error('Set ENABLE_CUSTOMER_BOOKING_NOTICE_WORKER=yes only after isolated staging validation.');
    process.exitCode=1;return;
  }
  const {Pool}=require('pg');
  const {createPoolConfig}=require('../database/poolConfig');
  const {createTelegramApi}=require('./api');
  const api=createTelegramApi(process.env.TELEGRAM_BOT_TOKEN);
  const pool=new Pool({...createPoolConfig(process.env),max:2,connectionTimeoutMillis:5000,query_timeout:25000});
  const stopController=new AbortController();
  const stop=()=>stopController.abort();
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{await run({pool,api,signal:stopController.signal});}
  finally{await pool.end();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(require.main===module)main().catch(()=>{console.error('Customer Telegram notification worker stopped');process.exitCode=1;});
module.exports={run};
