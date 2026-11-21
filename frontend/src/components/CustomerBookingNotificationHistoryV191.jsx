import {useEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {getSession,subscribeSession} from '../pages/auth/utils/session.js';
import {request} from '../api/client.js';
import {readSiteLocale} from '../utils/siteLocale.js';
import {sameCustomerSession} from './customerTelegramModelV190.js';
import {safeNotificationHistory,EVENT_LABELS,DELIVERY_LABELS} from './customerBookingNotificationModelV191.js';
const copy={
 uz:{title:'Bron xabarlari holati',refresh:'Xabarlar holatini yangilash',empty:'Hozircha yuborish so‘rovlari yo‘q.',error:'Xabar holatini olishning imkoni bo‘lmadi.',info:'“Telegram API qabul qildi” xabar yetkazilgan yoki o‘qilgan degani emas.'},
 ru:{title:'Статус уведомлений о записи',refresh:'Обновить статусы',empty:'Пока нет записей об отправке.',error:'Не удалось получить статусы.',info:'«Принято API Telegram» не означает доставку или прочтение.'},
 en:{title:'Booking notice status',refresh:'Refresh delivery status',empty:'No notification attempts yet.',error:'Could not load notification status.',info:'“Telegram API accepted” does not mean delivered or read.'}
};
export default function CustomerBookingNotificationHistoryV191(){
 const lang=readSiteLocale(useLocation().search),ui=copy[lang]||copy.uz;
 const [items,setItems]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const task=useRef(null),alive=useRef(true);
 useEffect(()=>{
  alive.current=true;
  const clear=()=>{task.current?.abort();task.current=null;setItems(null);setBusy(false);setError('');};
  const unsubscribe=subscribeSession(clear);
  return ()=>{alive.current=false;unsubscribe();task.current?.abort();task.current=null;};
 },[]);
 async function refresh(){
  if(task.current)return;
  const auth=getSession();if(auth?.role!=='customer'||!auth.token){setItems(null);return;}
  const controller=new AbortController();task.current=controller;setBusy(true);setError('');
  try{
   const response=await request('GET','/api/customers/telegram/notifications',{token:auth.token,signal:controller.signal});
   if(!alive.current||controller.signal.aborted||!sameCustomerSession(auth,getSession()))return;
   const parsed=safeNotificationHistory(response);if(!parsed)throw Error(ui.error);
   setItems(parsed);
  }catch{if(alive.current&&!controller.signal.aborted){setItems(null);setError(ui.error);}}
  finally{if(task.current===controller){task.current=null;if(alive.current)setBusy(false);}}
 }
 return <div aria-label={ui.title} aria-busy={busy}>
  <h4>{ui.title}</h4><p>{ui.info}</p>
  <button type="button" onClick={()=>void refresh()} disabled={busy}>{ui.refresh}</button>
  {error&&<p role="alert">{error}</p>}
  {items?.length===0&&<p>{ui.empty}</p>}
  {items?.length>0&&<ul>{items.map(item=><li key={item.id}>
   #{item.bookingId}: {(EVENT_LABELS[lang]||EVENT_LABELS.uz)[item.event]} — {(DELIVERY_LABELS[lang]||DELIVERY_LABELS.uz)[item.status]}
  </li>)}</ul>}
 </div>;
}
