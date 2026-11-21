'use strict';
const pool=require('../db');
const {createSmartBookingOffers}=require('../services/smartBookingOffers');
const service=createSmartBookingOffers(pool);
const {createSmartBookingConfirmation}=require('../services/smartBookingConfirmation');
const confirmation=createSmartBookingConfirmation(pool);
const {notifyAfterCommit}=require('../services/bookingNotificationAfterCommit');
const {createBookingNotifier}=require('../services/telegramBookingNotifications');
const notifyBooking=createBookingNotifier({pool});
function error(res,e){res.set('Cache-Control','no-store');
 if(e.status)return res.status(e.status).json({code:e.code,message:e.message});
 if(['40P01','55P03','57014','23505','23P01'].includes(e.code))return res.status(409).json({code:'offer_busy',message:'Taklif o‘zgardi. Qayta urinib ko‘ring.'});
 console.error('smart booking',e.code||'unknown');return res.status(503).json({code:'offers_unavailable',message:'Taklif vaqtincha ishlamayapti.'});}
const uid=v=>{const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null;};
async function decide(req,res){try{
 const r=await service.decide({...req.body,offer_id:req.params.id});res.set('Cache-Control','no-store');
 return res.status(r.httpStatus||200).json(r);
 }catch(e){return error(res,e);}}
async function manualDecision(req,res){try{
 const r=await service.decideByCustomer({offer_id:req.params.id,action:req.body?.action,actor:req.user});
 res.set('Cache-Control','no-store');return res.status(r.httpStatus||200).json(r);
 }catch(e){return error(res,e);}}
async function manualServices(req,res){try{
 const result=await confirmation.services({offer_id:req.params.id,multi_service:true,actor:req.user,manual:true});
 res.set('Cache-Control','no-store');return res.json(result);
 }catch(e){return error(res,e);}}
async function manualConfirm(req,res){try{
 const result=await confirmation.confirm({...req.body,offer_id:req.params.id,actor:req.user,manual:true});
 if(!result.replayed)await notifyAfterCommit(notifyBooking,result.booking_id,'confirmed');
 res.set('Cache-Control','no-store');return res.status(result.replayed?200:201).json(result);
 }catch(e){return error(res,e);}}
function barberIdentity(actor){
 if(actor?.role!=='barber')return null;
 const barberId=uid(actor.profileId),userId=uid(actor.accountId??actor.id);
 return barberId&&userId?{barberId,userId}:null;
}
async function mine(req,res){try{
 const actor=barberIdentity(req.user);
 if(!actor)return res.status(403).json({code:'forbidden'});
 const data=await service.listForBarber(actor.barberId,actor.userId);
 res.set('Cache-Control','no-store');return res.json({openings:data});
 }catch(e){return error(res,e);}}
async function cancel(req,res){try{
 const actor=barberIdentity(req.user);
 if(!actor)return res.status(403).json({code:'forbidden'});
 const data=await service.cancelBarber(req.params.id,actor.barberId,actor.userId);
 res.set('Cache-Control','no-store');return res.json(data);
 }catch(e){return error(res,e);}}
async function services(req,res){try{
 const result=await confirmation.services({...req.body,offer_id:req.params.id});
 res.set('Cache-Control','no-store');return res.json(result);
 }catch(e){return error(res,e);}}
async function confirm(req,res){try{
 const result=await confirmation.confirm({...req.body,offer_id:req.params.id,actor:req.user});
 // Booking is committed before attempting Telegram notification.
 if(!result.replayed)await notifyAfterCommit(notifyBooking,result.booking_id,'confirmed');
 res.set('Cache-Control','no-store');return res.status(result.replayed?200:201).json(result);
 }catch(e){return error(res,e);}}
module.exports={decide,mine,cancel,services,confirm,manualDecision,manualServices,manualConfirm};
