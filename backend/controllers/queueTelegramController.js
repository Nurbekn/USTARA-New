'use strict';
const pool=require('../db');
const {createQueueTelegramService}=require('../services/queueTelegramNotifications');
function createHandlers(service=createQueueTelegramService({pool})){
 const execute=(action)=>(async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{return res.json(await service[action](req.body?.token,req.body?.request_id));}
  catch(e){
   if(e.status)return res.status(e.status).json({code:e.code,message:e.message});
   // Do not return/log tokens, request IDs or raw database errors.
   return res.status(503).json({code:'telegram_unavailable',message:'Telegram xabarnomasi vaqtincha ishlamayapti.'});
  }
 });
 async function offerConsent(req,res){
  res.set('Cache-Control','no-store');
  try{return res.json(await service.offerConsent(req.body?.token,req.body?.request_id,req.body?.enabled));}
  catch(e){if(e.status)return res.status(e.status).json({code:e.code,message:e.message});
   return res.status(503).json({code:'telegram_unavailable',message:'Taklif xabarnomasi vaqtincha ishlamayapti.'});}
 }
 return {optIn:execute('issue'),optOut:execute('unlink'),offerConsent};
}
module.exports={createHandlers};
