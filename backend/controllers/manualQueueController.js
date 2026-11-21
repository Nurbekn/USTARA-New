'use strict';
const pool=require('../db');
const {createManualQueueClaims}=require('../services/manualQueueClaims');
const service=createManualQueueClaims(pool);
function error(res,e){
 res.set('Cache-Control','no-store');
 if(e.status)return res.status(e.status).json({code:e.code,message:e.message});
 if(['40P01','55P03','57014','23505'].includes(e.code))return res.status(409).json({code:'queue_busy',message:'Navbat o‘zgardi. Qayta urinib ko‘ring.'});
 console.error('manual queue',e.code||'unavailable');
 return res.status(503).json({code:'queue_unavailable',message:'Navbat vaqtincha ishlamayapti.'});
}
async function claimCode(req,res){try{
 const result=await service.issue({actor:req.user,entry_id:req.params.id});
 res.set('Cache-Control','no-store');return res.status(201).json(result);
}catch(e){return error(res,e);}}
async function claim(req,res){try{
 const result=await service.claim({actor:req.user,code:req.body?.code});
 res.set('Cache-Control','no-store');return res.status(201).json(result);
}catch(e){return error(res,e);}}
async function mine(req,res){try{
 const result=await service.mine({actor:req.user});
 res.set('Cache-Control','no-store');return res.json(result);
}catch(e){return error(res,e);}}
async function revoke(req,res){try{
 const result=await service.revoke({actor:req.user,entry_id:req.params.id});
 res.set('Cache-Control','no-store');return res.json(result);
}catch(e){return error(res,e);}}
module.exports={claimCode,claim,mine,revoke};
