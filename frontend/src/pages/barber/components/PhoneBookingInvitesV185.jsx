import {useCallback,useEffect,useRef,useState} from 'react';
import {request} from '../../../api/client.js';
import {getSession,subscribeSession} from '../../auth/utils/session.js';
import {bookingDates} from '../../user/bookings/bookingDates.js';
import {inviteLinkV185} from '../../user/barber/phoneInviteModelV185.js';

const copy={
 uz:{title:'Telefon orqali bron taklifi',hint:'Qo‘ng‘iroqdan keyin mijozga havolani yuboring. Havola 30 daqiqa ishlaydi. Mijoz o‘zi kirmaguncha bron yaratilmaydi va slot band qilinmaydi.',service:'Xizmat',date:'Sana',time:'Vaqt (Toshkent)',create:'Havola yaratish',refresh:'Yangilash',empty:'Hozircha havolalar yo‘q.',copy:'Havolani nusxalash',copied:'Nusxalandi',revoke:'Bekor qilish',active:'Faol',expired:'Muddati tugagan',revoked:'Bekor qilingan',error:'Havolalar yuklanmadi.',unknown:'Javob noma’lum. Yangi havola yaratishdan oldin ro‘yxatni yangilang.',sensitive:'Mijozning telefon raqamini bu yerga kiritmang. Havola OTP o‘rnini bosmaydi.'},
 ru:{title:'Запись по телефону — приглашение',hint:'Передайте клиенту ссылку после звонка. Она действует 30 минут. Пока клиент не подтвердит запись, время не бронируется.',service:'Услуга',date:'Дата',time:'Время (Ташкент)',create:'Создать ссылку',refresh:'Обновить',empty:'Пока нет приглашений.',copy:'Скопировать ссылку',copied:'Скопировано',revoke:'Отозвать',active:'Активна',expired:'Истекла',revoked:'Отозвана',error:'Не удалось загрузить.',unknown:'Неизвестный результат. Проверьте список перед повтором.',sensitive:'Не вводите номер клиента. Ссылка не заменяет OTP.'},
 en:{title:'Phone booking invitation',hint:'Share the link with the caller. It expires in 30 minutes. No booking or slot hold exists until the customer confirms.',service:'Service',date:'Date',time:'Time (Tashkent)',create:'Create link',refresh:'Refresh',empty:'No invitations yet.',copy:'Copy link',copied:'Copied',revoke:'Revoke',active:'Active',expired:'Expired',revoked:'Revoked',error:'Could not load invitations.',unknown:'Result unknown. Refresh the list before creating another link.',sensitive:'Do not enter a customer phone number. This link does not bypass OTP.'}
};
const validDay=value=>bookingDates().includes(value);
const validTime=value=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)&&Number(value.slice(3))%5===0;
export default function PhoneBookingInvitesV185({lang='uz',services=[],barberId}) {
 const t=copy[lang]||copy.uz;
 const [serviceId,setServiceId]=useState('');
 const [date,setDate]=useState(bookingDates()[0]);
 const [time,setTime]=useState('');
 const [state,setState]=useState({status:'loading',items:[],message:''});
 const [created,setCreated]=useState(null);
 const [busy,setBusy]=useState(false);
 const [copied,setCopied]=useState(false);
 const run=useRef(0);
 const inFlight=useRef(null);
 const load=useCallback(async()=>{
   const seq=++run.current;
   inFlight.current?.abort();
   const session=getSession();
   if(session?.role!=='barber'||!session.token){setCreated(null);setState({status:'blocked',items:[],message:''});return;}
   const controller=new AbortController();inFlight.current=controller;
   try{
     const result=await request('GET','/api/bookings/phone-invites/mine',{token:session.token,signal:controller.signal});
     if(!Array.isArray(result?.items))throw new Error(t.error);
     if(seq===run.current&&!controller.signal.aborted&&getSession()?.token===session.token)
       setState({status:'ready',items:result.items,message:''});
   }catch(error){if(seq===run.current&&!controller.signal.aborted&&getSession()?.token===session.token)
      setState({status:'error',items:[],message:error.message||t.error});}
 },[t.error]);
 useEffect(()=>{
   void load();const un=subscribeSession(()=>{setCreated(null);void load();});
   return()=>{un();run.current++;inFlight.current?.abort();};
 },[load]);
 async function create(){
   if(busy||!Number.isSafeInteger(barberId)||!validDay(date)||!validTime(time)||!Number.isSafeInteger(Number(serviceId))||Number(serviceId)<=0)return;
   const session=getSession();if(session?.role!=='barber'||!session.token)return;
   setBusy(true);setCreated(null);setCopied(false);
   try{
     const result=await request('POST','/api/bookings/phone-invites',{token:session.token,
       body:{serviceId:Number(serviceId),bookingTime:`${date}T${time}:00+05:00`}});
     if(getSession()?.token!==session.token)return;
     const link=inviteLinkV185(barberId,result?.token);
     if(!link)throw new Error(t.unknown);
     setCreated({link,expiresAt:result.expiresAt});await load();
   }catch(error){if(getSession()?.token===session.token)
      setState({status:'error',items:[],message:error.status===0?t.unknown:error.message||t.unknown});}
   finally{setBusy(false);}
 }
 async function revoke(id){
  if(busy)return;
  const session=getSession();if(session?.role!=='barber'||!session.token)return;
  setBusy(true);
  try {await request('DELETE',`/api/bookings/phone-invites/${id}`,{token:session.token});if(getSession()?.token===session.token){setCreated(null);await load();}}
  catch(error){if(getSession()?.token===session.token)setState(old=>({...old,status:'error',message:error.message}));}
  finally{setBusy(false);}
 }
 const available=Array.isArray(services)?services.filter(s=>s.active!==false):[];
 return <section className="bx-card" aria-label={t.title} style={{display:'grid',gap:12}}>
  <h2>{t.title}</h2><p className="bx-muted">{t.hint}</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'end'}}>
   <label>{t.service}<select value={serviceId} onChange={e=>setServiceId(e.target.value)} disabled={busy}>
     <option value="">—</option>{available.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
   </select></label>
   <label>{t.date}<select value={date} onChange={e=>setDate(e.target.value)} disabled={busy}>
     {bookingDates().map(day=><option key={day} value={day}>{day}</option>)}
   </select></label>
   <label>{t.time}<input type="time" step="300" value={time} onChange={e=>setTime(e.target.value)} disabled={busy}/></label>
   <button className="bx-btn" type="button" onClick={()=>void create()} disabled={busy||!serviceId||!validTime(time)}>{t.create}</button>
  </div>
  <p className="bx-muted">{t.sensitive}</p>
  {created&&<div role="status" style={{display:'grid',gap:6}}>
   <label>{t.copy}<input readOnly value={created.link} aria-label={t.copy} onFocus={e=>e.target.select()}/></label>
   <button className="bx-btn" type="button" onClick={async()=>{try{await navigator.clipboard.writeText(created.link);setCopied(true);}catch{setCopied(false);}}}>{copied?t.copied:t.copy}</button>
  </div>}
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><strong>{t.title}</strong>
   <button type="button" className="bx-btn" onClick={()=>void load()} disabled={busy}>{t.refresh}</button></div>
  {state.status==='error'&&<p role="alert" className="bx-error">{state.message}</p>}
  {state.status==='ready'&&(state.items.length===0?<p className="bx-muted">{t.empty}</p>:
   <ul style={{display:'grid',gap:6}}>{state.items.map(row=><li key={row.id}>
     #{row.id} · {String(row.booking_time||'').slice(0,16)} · {t[row.state]||row.state}
     {row.state==='active'&&<button type="button" className="bx-btn" disabled={busy} onClick={()=>void revoke(row.id)}>{t.revoke}</button>}
   </li>)}</ul>)}
 </section>;
}
