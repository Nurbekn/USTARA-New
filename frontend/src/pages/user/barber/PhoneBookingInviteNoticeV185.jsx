import {useEffect,useState} from 'react';
import {request} from '../../../api/client.js';
import {bookingDates} from '../bookings/bookingDates.js';
import {inviteSelectionV185,TOKEN_RE_V185} from './phoneInviteModelV185.js';
const texts={
 uz:{ready:'Telefon orqali taklifdagi xizmat va vaqt tanlandi. Bo‘sh vaqtni, narxni va qoidalarni tekshirib, bronni o‘zingiz tasdiqlang.',error:'Telefon orqali taklif muddati tugagan yoki mos kelmaydi. Bronni odatdagidek tanlashingiz mumkin.',loading:'Taklif tekshirilmoqda…'},
 ru:{ready:'Услуга и время из телефонного приглашения выбраны. Проверьте доступность, цену и правила, затем подтвердите запись самостоятельно.',error:'Приглашение истекло или недоступно. Вы можете выбрать время вручную.',loading:'Проверка приглашения…'},
 en:{ready:'Service and time were selected from the phone invitation. Check availability, price and terms before confirming the booking yourself.',error:'Invitation expired or unavailable. You can still book normally.',loading:'Checking invitation…'}
};
export default function PhoneBookingInviteNoticeV185({token,barberId,serviceIds,lang='uz',onSelection}) {
 const [state,setState]=useState('loading');
 const tr=texts[lang]||texts.uz;
 useEffect(()=>{
  if(!TOKEN_RE_V185.test(token||'')){setState('error');return;}
  const controller=new AbortController();setState('loading');
  request('GET',`/api/bookings/phone-invites/${encodeURIComponent(token)}`,{signal:controller.signal})
   .then(data=>{
     if(controller.signal.aborted)return;
     const selected=inviteSelectionV185(data,barberId,serviceIds,bookingDates());
     if(!selected){setState('error');return;}
     onSelection(selected);setState('ready');
   }).catch(()=>{if(!controller.signal.aborted)setState('error');});
  return()=>controller.abort();
 },[token,barberId,serviceIds.join(',')]);
 return <p role="status" className="ib-note">{tr[state]||tr.error}</p>;
}
