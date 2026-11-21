'use strict';
const {createQueueSelfExit}=require('../services/queueSelfExit');
function createHandlers(db=require('../db')){
 const exit=createQueueSelfExit(db);
 function error(res,e){
  res.set('Cache-Control','no-store');
  if(e.commitUncertain)return res.status(503).json({code:'queue_result_unknown',message:'Natija noaniq. Navbat holatini tekshiring; so‘rovni avtomatik takrorlamang.'});
  if(e.status)return res.status(e.status).json({code:e.code,message:e.message});
  if(['55P03','40P01','40001','57014'].includes(e.code))
   return res.status(409).json({code:'queue_busy',message:'Navbat band. Qayta urinib ko‘ring.'});
  console.error('queue self exit',e.code||'unavailable');
  return res.status(503).json({code:'queue_unavailable',message:'Navbat vaqtincha ishlamayapti.'});
 }
 async function leaveQr(req,res){
  try{const data=await exit.leaveQr(req.body||{});
   res.set('Cache-Control','no-store');return res.status(200).json(data);
  }catch(e){return error(res,e);}
 }
 async function leaveManual(req,res){
  try{const data=await exit.leaveManual({entry_id:req.params.id,actor:req.user});
   res.set('Cache-Control','no-store');return res.status(200).json(data);
  }catch(e){return error(res,e);}
 }
 return {leaveQr,leaveManual};
}
module.exports={createHandlers};
