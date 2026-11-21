'use strict';
function createOfferCallbackHandler({offers,api,botId}){
 return async (query,signal)=>{
  if(typeof query?.id!=='string'||!query.id||query.id.length>256)return;
  const answer=(text,alert=true)=>api('answerCallbackQuery',{
    callback_query_id:query.id,text,show_alert:alert},signal);
  const msg=query.message,chat=msg?.chat;
  if(chat?.type!=='private'||!Number.isSafeInteger(chat.id)||chat.id<=0||
     !Number.isSafeInteger(query.from?.id)||query.from?.is_bot||query.from.id!==chat.id||
     !Number.isSafeInteger(botId)||msg?.from?.is_bot!==true||msg.from.id!==botId||
     !Number.isSafeInteger(msg.message_id)||msg.message_id<=0){
   await answer('Taklif tugmasi faqat o‘zingizning bot chatingizda ishlaydi.');return;
  }
  const parsed=typeof query.data==='string'&&/^so:(a|r):([1-9]\d{0,14})$/.exec(query.data);
  const offerId=parsed&&Number(parsed[2]);
  if(!parsed||!Number.isSafeInteger(offerId)){
   await answer('Taklif tugmasi noto‘g‘ri.');return;
  }
  let result;
  try{
   result=await offers.decideByTelegram({offer_id:offerId,action:parsed[1]==='a'?'accept':'reject',
     chat_id:chat.id,message_id:msg.message_id});
  }catch(e){
   if(e.status>=400&&e.status<500){await answer(e.message);return;}
   throw e;
  }
  if(result.httpStatus>=400){await answer('Taklif muddati tugagan yoki vaqt band bo‘lgan.');return;}
  // Never claim a booking was created. Customer authentication is required.
  const notice=parsed[1]==='a'?'Taklif qabul qilindi. 2 daqiqada saytdagi QR navbat yoki «Oddiy navbatim» sahifasidan bronni tasdiqlang.':'Taklif rad etildi.';
  try{await api('editMessageReplyMarkup',{chat_id:chat.id,message_id:msg.message_id,
    reply_markup:{inline_keyboard:[]}},signal);}catch{/* best effort */}
  await answer(notice,false);
 };
}
module.exports={createOfferCallbackHandler};
