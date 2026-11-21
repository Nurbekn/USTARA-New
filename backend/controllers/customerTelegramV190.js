'use strict';
const {createCustomerTelegramLink,CustomerTelegramError}=require('../services/customerTelegramLinkV190');
function createHandlers(service){
  return Object.fromEntries(['start','status','unlink','preferences'].map(action=>[action,async(req,res)=>{
    res.set('Cache-Control','no-store');
    if(req.user?.role!=='customer')return res.status(403).json({code:'customer_required'});
    try{return res.status(200).json(await service[action](req.user,req.body));}
    catch(error){
      if(error instanceof CustomerTelegramError)return res.status(error.status).json({code:error.code,message:error.message});
      return res.status(503).json({code:'telegram_unavailable',message:'Telegram xizmati vaqtincha ishlamayapti.'});
    }
  }]));
}
let live;
const handlers=Object.fromEntries(['start','status','unlink','preferences'].map(action=>[action,(req,res)=>{
  live ||= createHandlers(createCustomerTelegramLink({pool:require('../db')}));
  return live[action](req,res);
}]));
module.exports={createHandlers,...handlers};
