'use strict';
const {Pool}=require('pg');
const {createPoolConfig}=require('../database/poolConfig');
const {createSmartBookingOffers}=require('../services/smartBookingOffers');
const {setTimeout:delay}=require('node:timers/promises');
async function work({pool,signal}){
 const offers=createSmartBookingOffers(pool);
 while(!signal?.aborted){
  try{await offers.tick();}
  catch(e){console.error('Smart Booking worker: database or offer failure',e.code||'unknown');}
  try{await delay(5000,undefined,{signal});}catch{break;}
 }
}
async function main(){
 const db=new Pool({...createPoolConfig(process.env),max:2,connectionTimeoutMillis:5000,query_timeout:12000});
 const abort=new AbortController(),stop=()=>abort.abort();
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{await work({pool:db,signal:abort.signal});}
 finally{await db.end();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(require.main===module)main().catch(()=>{console.error('Smart Booking worker stopped');process.exitCode=1;});
module.exports={work};
