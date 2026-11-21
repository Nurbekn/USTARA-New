import {useCallback,useEffect,useRef,useState} from 'react';
import {useParams,Link,useLocation} from 'react-router-dom';
import SiteLanguageSelect from '../../components/SiteLanguageSelect.jsx';
import {readSiteLocale,siteLocalePath} from '../../utils/siteLocale.js';
import {socialQueueText,localizeQueueWait} from '../user/social/socialQueueLocaleV149.js';
import {isValidQrToken,qrStorageKey,statusLabel,isActiveTicket,formatWait} from './qrModel.js';
import {request} from '../../api/client.js';
import {getSession,subscribeSession} from '../auth/utils/session.js';
import {parseQrQueueStatus} from './qrStatusReadGuard.js';
import {offerBundle} from './serviceBundle.js';
import {createLatestRequestGate} from './requestOrderV42.js';
import {canSelfExitQueue} from './queueExitEligibility.js';

function readKey(token){try{return sessionStorage.getItem(qrStorageKey(token));}catch{return null;}}
function saveKey(token,key){try{sessionStorage.setItem(qrStorageKey(token),key);}catch{/* private mode */}}
function QueueCheckInContent({token}){
 const lang=readSiteLocale(useLocation().search),tr=socialQueueText(lang);
 const [label,setLabel]=useState(''),[key,setKey]=useState(()=>readKey(token));
 const [status,setStatus]=useState(null),[ticket,setTicket]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [telegramLink,setTelegramLink]=useState(null),[telegramBusy,setTelegramBusy]=useState(false);
 const [offerBusy,setOfferBusy]=useState(false),[offerClock,setOfferClock]=useState(Date.now());
 const [offerServices,setOfferServices]=useState(null),[selectedServiceIds,setSelectedServiceIds]=useState([]);
 const bundle=offerBundle(offerServices?.services,selectedServiceIds,offerServices?.duration_minutes);
 const [bookingResult,setBookingResult]=useState(null);
 const [leaveConfirm,setLeaveConfirm]=useState(false),[leaveBusy,setLeaveBusy]=useState(false);
 const [statusUnavailable,setStatusUnavailable]=useState(false);
 const [customerSession,setCustomerSession]=useState(()=>getSession());
 const authTokenRef=useRef(customerSession?.token||null);
 const keyRef=useRef(key);
 const statusGate=useRef(createLatestRequestGate());
 // A changing login cannot make a pending result belong to another account.
 useEffect(()=>subscribeSession(()=>{
  const next=getSession(),oldToken=authTokenRef.current;
  authTokenRef.current=next?.token||null;
  setCustomerSession(next);
  if(oldToken!==authTokenRef.current){
   setBookingResult(null);setOfferServices(null);setSelectedServiceIds([]);
  }
 }),[]);
 const failRead=useCallback((message)=>{
  setStatusUnavailable(true);setTicket(null);setLeaveConfirm(false);
  setOfferServices(null);setSelectedServiceIds([]);setTelegramLink(null);
  setError(message);
 },[]);
 const check=useCallback(async(signal)=>{
  const receipt=keyRef.current;
  if(!isValidQrToken(token)||!receipt)return;
  const epoch=statusGate.current.next();
  try{
   const data=await request('POST','/api/queue/qr-status',{body:{token,request_id:receipt},signal});
   // A slower previous poll must never overwrite a newer queue status.
   if(signal?.aborted||keyRef.current!==receipt||!statusGate.current.isLatest(epoch))return;
   const validated=parseQrQueueStatus(data);
   if(!validated){failRead(tr('Navbat javobi noto‘g‘ri. Qayta tekshiring.'));return;}
   setStatusUnavailable(false);setStatus(validated.status);setTicket(validated);setError('');
   if(validated.status!=='approved'||!canSelfExitQueue(validated.queue_status))setLeaveConfirm(false);
  }catch(e){if(!signal?.aborted&&keyRef.current===receipt&&statusGate.current.isLatest(epoch)){
    failRead(tr('Navbatni tekshirib bo‘lmadi. Internetni tekshirib, qayta urinib ko‘ring.'));
   }}
 },[token,failRead,lang]);
 useEffect(()=>{
  const controller=new AbortController();
  if(keyRef.current)void check(controller.signal);
  return ()=>{controller.abort();statusGate.current.invalidate();};
 },[check]);
 useEffect(()=>{
  if(!['pending','accepted'].includes(ticket?.smart_offer?.status))return;
  const interval=setInterval(()=>setOfferClock(Date.now()),1000);
  return ()=>clearInterval(interval);
 },[ticket?.smart_offer?.id,ticket?.smart_offer?.status]);
 useEffect(()=>{
  const offer=ticket?.smart_offer;
  if(!offer||offer.status!=='accepted'||!keyRef.current){setOfferServices(null);setSelectedServiceIds([]);return;}
  let cancelled=false;const receipt=keyRef.current;
  void request('POST',`/api/queue/offers/${offer.id}/services`,{body:{token,request_id:receipt,multi_service:true}})
   .then(data=>{if(!cancelled&&keyRef.current===receipt){setOfferServices(data);setSelectedServiceIds([]);}})
   .catch(e=>{if(!cancelled&&keyRef.current===receipt){setOfferServices(null);setError(e.message);}});
  return ()=>{cancelled=true;};
 },[ticket?.smart_offer?.id,ticket?.smart_offer?.status,token]);
 useEffect(()=>{
  if(!key||statusUnavailable||!isActiveTicket(status,ticket?.queue_status))return;
  const timer=setInterval(()=>{if(document.visibilityState==='visible')void check();},15000);
  return ()=>clearInterval(timer);
 },[key,status,ticket?.queue_status,statusUnavailable,check]);
 async function submit(e){
  e.preventDefault();if(!isValidQrToken(token)||busy||status)return;
  setBusy(true);setError('');
  const identifier=keyRef.current||crypto.randomUUID().replaceAll('-','');
  statusGate.current.invalidate(); // submission result wins over an older poll
  keyRef.current=identifier;setKey(identifier);saveKey(token,identifier);
  try{
   await request('POST','/api/queue/qr-requests',{body:{token,request_id:identifier,label:label.trim()||'Mehmon'}});
   await check(); // never trust an unvalidated submit response as the active ticket
  }catch(e){setError(e.message);}
  finally{setBusy(false);}
 }
 async function offerDecision(action){
  if(statusUnavailable||offerBusy||!keyRef.current||!ticket?.smart_offer?.id)return;
  setOfferBusy(true);setError('');
  try{
   const result=await request('POST',`/api/queue/offers/${ticket.smart_offer.id}/decision`,
     {body:{token,request_id:keyRef.current,action}});
   if(result.httpStatus>=400)throw Error(result.code||tr('Taklif muddati tugagan.'));
   await check();
  }catch(e){try{await check();}catch{/* check already reports error */}setError(e.message);}finally{setOfferBusy(false);}
 }
 async function confirmBooking(){
  const session=getSession(),offer=ticket?.smart_offer;
  if(statusUnavailable||offerBusy||!session?.token||session.role!=='customer'||!offer||!bundle.valid||!keyRef.current)return;
  const receipt=keyRef.current,authToken=session.token;
  setOfferBusy(true);setError('');
  try{
   const response=await request('POST',`/api/queue/offers/${offer.id}/confirm-booking`,{
    token:session.token,body:{token,request_id:keyRef.current,service_ids:selectedServiceIds,expected_total_price:bundle.totalPrice}
   });
   if(keyRef.current!==receipt || getSession()?.token!==authToken)return;
   setBookingResult(response);await check();
  }catch(e){
   if(keyRef.current!==receipt || getSession()?.token!==authToken)return;
   setError(e.message);
   if(['price_changed','service_unavailable','duration_mismatch'].includes(e.code)){
    // The old UI quote is no longer trustworthy after catalog changes.
    setSelectedServiceIds([]);
    try{setOfferServices(await request('POST',`/api/queue/offers/${offer.id}/services`,
     {body:{token,request_id:keyRef.current,multi_service:true}}));}
    catch{setOfferServices(null);}
   }
   await check();
  }finally{setOfferBusy(false);}
 }
 async function leaveQueue(){
  if(statusUnavailable||leaveBusy||!keyRef.current||!leaveConfirm||status!=='approved'||!canSelfExitQueue(ticket?.queue_status))return;
  setLeaveBusy(true);setError('');
  try{
   await request('POST','/api/queue/qr-leave',{body:{token,request_id:keyRef.current}});
   setLeaveConfirm(false);setTelegramLink(null);await check();
  }catch(e){
   setError(e.code==='queue_result_unknown'?tr('Navbatdan chiqish natijasi noaniq. Holatni tekshiring.'):e.message);
   await check();
  }finally{setLeaveBusy(false);}
 }
 async function offerNotification(enabled){
  if(statusUnavailable||telegramBusy||!keyRef.current)return;
  setTelegramBusy(true);setError('');
  try{await request('POST','/api/queue/telegram/offer-consent',{
   body:{token,request_id:keyRef.current,enabled}});await check();}
  catch(e){setError(e.message);}finally{setTelegramBusy(false);}
 }
 async function telegramAction(action){
  if(statusUnavailable||telegramBusy||!keyRef.current)return;
  setTelegramBusy(true);setError('');
  try{
   const data=await request('POST',action==='join'?'/api/queue/telegram/opt-in':'/api/queue/telegram/opt-out',
    {body:{token,request_id:keyRef.current}});
   setTelegramLink(action==='join'?data.url:null);
   await check();
  }catch(e){setError(e.message);}finally{setTelegramBusy(false);}
 }
 return <main className="bx-page" style={{maxWidth:560,margin:'30px auto',padding:16,display:'grid',gap:18}}>
  <section className="bx-card" style={{display:'grid',gap:12}}>
   <SiteLanguageSelect /><h1>{tr("Navbatga QR orqali kirish")}</h1>
   <p className="bx-muted">{tr("Bu oldindan vaqt band qilish emas. Sartarosh tasdiqlagach walk-in navbatiga qo‘shilasiz. Telefon raqamingiz kerak emas.")}</p>
   {!isValidQrToken(token)?<p role="alert" className="bx-error">{tr("QR havola noto‘g‘ri.")}</p>:<>
    {!status&&<form onSubmit={submit} style={{display:'grid',gap:10}}>
     <label>{tr("Ism yoki belgi (ixtiyoriy)")}
      <input type="text" value={label} maxLength={60} disabled={busy||!!key} placeholder={tr("Mehmon")} onChange={e=>setLabel(e.target.value)} />
     </label>
     <button className="bx-btn bx-btn-primary" type="submit" disabled={busy}> {busy?tr("Yuborilmoqda…"):key?tr("So‘rovni qayta yuborish"):tr("Sartaroshga so‘rov yuborish")}</button>
    </form>}
    {!!status&&!statusUnavailable&&<div role="status" aria-live="polite" style={{display:'grid',gap:8}}>
      <strong>{tr(statusLabel(status,ticket?.queue_status))}</strong>
      {status==='approved'&&ticket?.queue_status==='waiting'&&Number.isInteger(ticket.position)&&<p>
        {tr("Navbatdagi o‘rningiz:")} <strong>{ticket.position}</strong>
        {formatWait(ticket.estimated_wait)&&<> · {tr("Kutish:")} {localizeQueueWait(formatWait(ticket.estimated_wait),lang)}</>}
      </p>}
      {status==='approved'&&ticket?.queue_status==='called'&&<p><strong>{tr("Navbatingiz keldi.")}</strong> {tr("Sartaroshga murojaat qiling.")}</p>}
      {status==='approved'&&ticket?.queue_status==='arrived'&&<p><strong>{tr("Kelganingiz tasdiqlandi.")}</strong> {tr("Xizmat boshlanishini kuting.")}</p>}
      {status==='approved'&&ticket?.queue_status==='in_service'&&<p><strong>{tr("Xizmat boshlandi.")}</strong> {tr("Sartarosh xizmatni yakunlaydi.")}</p>}
      {status==='approved'&&canSelfExitQueue(ticket?.queue_status)&&<small className="bx-muted">
        {tr("Ma’lumot taxminan har 15 soniyada yangilanadi. Kutish vaqti xizmatlar va oldindan band qilingan bronlarga bog‘liq.")}
      </small>}
    </div>}
    {!statusUnavailable&&status==='approved'&&ticket?.queue_status==='waiting'&&ticket?.smart_offer&&<div className="bx-card" style={{display:'grid',gap:8,border:'1px solid currentColor'}}>
      <strong>{tr("Bo‘shagan vaqt taklifi")}</strong>
      <p>{tr("Vaqt:")} {new Date(ticket.smart_offer.starts_at).toLocaleTimeString('uz-UZ',{timeZone:'Asia/Tashkent',hour:'2-digit',minute:'2-digit'})}.</p>
      <p className="bx-muted">{tr("Taklif 5 daqiqa amal qiladi. Qabul qilgach, 2 daqiqa ichida mijoz akkauntingizdan mos xizmatni tanlab haqiqiy bronni tasdiqlang.")}</p>
      {ticket.smart_offer.status==='pending'&&<>
       <strong role="timer">{tr("Qolgan vaqt:")} {Math.max(0,Math.ceil((new Date(ticket.smart_offer.expires_at).getTime()-offerClock)/1000))} {tr("soniya")}</strong>
       <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <button type="button" className="bx-btn bx-btn-primary" disabled={offerBusy||offerClock>=new Date(ticket.smart_offer.expires_at).getTime()} onClick={()=>void offerDecision('accept')}>{tr("Qabul qilish")}</button>
        <button type="button" className="bx-btn" disabled={offerBusy} onClick={()=>void offerDecision('reject')}>{tr("Rad etish")}</button>
       </div>
      </>}
      {ticket.smart_offer.status==='accepted'&&<>
       <p role="status">{tr("Taklif qabul qilindi, lekin vaqt hali band qilinmagan.")}</p>
       <strong role="timer">{tr("Bronni tasdiqlashga:")} {Math.max(0,Math.ceil((new Date(ticket.smart_offer.confirmation_deadline).getTime()-offerClock)/1000))} {tr("soniya")}</strong>
       {customerSession?.role==='customer'&&customerSession.token ? <>
        {offerServices?.services?.length ? <>
         <fieldset disabled={offerBusy} style={{display:'grid',gap:7,border:'1px solid #aaa',borderRadius:8,padding:12}}>
          <legend>{tr("Xizmatlarni tanlang (jami")} {offerServices.duration_minutes}{tr(" daqiqa)")}</legend>
          {offerServices.services.map(s=><label key={s.id} style={{display:'flex',gap:8,alignItems:'center'}}>
           <input type="checkbox" checked={selectedServiceIds.includes(Number(s.id))}
            disabled={!selectedServiceIds.includes(Number(s.id))&&selectedServiceIds.length>=20}
            onChange={e=>setSelectedServiceIds(prev=>e.target.checked?[...prev,Number(s.id)]:prev.filter(id=>id!==Number(s.id)))} />
           {s.name} · {s.price}{tr(" so‘m")} · {s.duration_minutes}{tr(" daqiqa")}
          </label>)}
         </fieldset>
         <p role="status" aria-live="polite">{tr("Tanlangan:")} {bundle.duration}/{offerServices.duration_minutes}{tr(" daqiqa")}
          {bundle.totalPrice&&<> · {tr("Jami:")} {bundle.totalPrice}{tr(" so‘m")}</>}
          {bundle.remaining>0&&<> · {tr("Yana")} {bundle.remaining}{tr(" daqiqa tanlang")}</>}
          {bundle.remaining<0&&<> · {Math.abs(bundle.remaining)}{tr(" daqiqa ortiqcha")}</>}
         </p>
         <button type="button" className="bx-btn bx-btn-primary" disabled={offerBusy||!bundle.valid||offerClock>=new Date(ticket.smart_offer.confirmation_deadline).getTime()}
          onClick={()=>void confirmBooking()}>{tr("Haqiqiy bronni tasdiqlash")}</button>
        </>:<p>{tr("Bu vaqt uchun faol xizmatlar topilmadi yoki ro‘yxat yuklanmoqda.")}</p>}
       </>:<p><Link to={siteLocalePath("/login",lang)}>{tr("Mijoz sifatida kiring")}</Link>, {tr("so‘ng shu QR sahifasiga qayting.")}</p>}
       <button type="button" className="bx-btn" disabled={offerBusy} onClick={()=>void offerDecision('cancel')}>{tr("Qabulni bekor qilish")}</button>
      </>}
    </div>}
    {!statusUnavailable&&bookingResult&&<div role="status" className="bx-card"><strong>{tr("Bron yaratildi:")} #{bookingResult.booking_id}</strong>
      <p>{tr("Holat:")} {bookingResult.status==='confirmed'?tr("Tasdiqlandi"):bookingResult.status}. {tr("Tafsilotlar mijoz profilingizdagi Bronlar bo‘limida.")}</p></div>}
    {!statusUnavailable&&status==='approved'&&ticket?.queue_status==='waiting'&&<div style={{display:'grid',gap:8}}>
      <strong>{tr("Telegram orqali navbat chaqiruvi (ixtiyoriy)")}</strong>
      <p className="bx-muted">{tr("Faqat o‘zingiz ulagan Telegram chatga navbatingiz kelganda xabar yuboramiz. Telefon raqami so‘ralmaydi.")}</p>
      {ticket?.telegram_linked?<>
       <p role="status">{tr("Navbat chaqiruvi uchun Telegram xabarlari yoqilgan.")}</p>
       <p className="bx-muted">{tr("Bo‘shagan vaqt takliflari uchun alohida rozilik kerak. Telegramda Qabul qilish bosilishi hali bron emas.")}</p>
       <button type="button" className="bx-btn" disabled={telegramBusy}
        onClick={()=>void offerNotification(!ticket.offers_enabled)}>
        {ticket.offers_enabled?tr('Taklif xabarlarini o‘chirish'):tr('Taklif xabarlariga rozilik berish')}
       </button>
       <button type="button" className="bx-btn" disabled={telegramBusy} onClick={()=>void telegramAction('leave')}>{tr("Telegram xabarlarini o‘chirish")}</button>
      </>:<>
       <button type="button" className="bx-btn" disabled={telegramBusy} onClick={()=>void telegramAction('join')}>{tr("Telegram xabarini yoqish")}</button>
       {telegramLink&&<a href={telegramLink} target="_blank" rel="noopener noreferrer">{tr("Telegram botda tasdiqlash (5 daqiqa amal qiladi)")}</a>}
      </>}
     </div>}
    {!statusUnavailable&&status==='approved'&&canSelfExitQueue(ticket?.queue_status)&&
     <div style={{display:'grid',gap:8}}>
      {!leaveConfirm?<button type="button" className="bx-btn" disabled={leaveBusy} onClick={()=>setLeaveConfirm(true)}>
       {tr("Navbatdan butunlay chiqish")}</button>:<div role="group" aria-label={tr("Navbatdan chiqishni tasdiqlash")} style={{display:'grid',gap:8}}>
        <p>{tr("Navbatdan chiqilsa, o‘rningiz va hali tasdiqlanmagan Smart Booking taklifingiz bekor bo‘ladi. Tasdiqlangan bronlar saqlanadi.")}</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
         <button type="button" className="bx-btn" disabled={leaveBusy} onClick={()=>setLeaveConfirm(false)}>{tr("Ortga")}</button>
         <button type="button" className="bx-btn bx-btn-primary" disabled={leaveBusy} onClick={()=>void leaveQueue()}>
          {leaveBusy?tr('Chiqilmoqda…'):tr('Ha, navbatdan chiqish')}</button>
        </div>
       </div>}
     </div>}
    {!!key&&<button type="button" className="bx-btn" disabled={busy} onClick={()=>void check()}>{tr("Holatni tekshirish")}</button>}
   </>}
   {!!error&&<p className="bx-error" role="alert">{error}</p>}
  </section>
  <p className="bx-muted">{tr("QR muddati Admin sozlamasiga bog‘liq; har bir QR bir marta ishlatiladi. So‘rov holatini shu oynada tekshiring. Tasdiqlanmasa, sartaroshdan yangi QR so‘rang.")}</p>
  <Link to={siteLocalePath("/",lang)}>{tr("Bosh sahifaga qaytish")}</Link>
 </main>;
}

export default function QueueCheckIn(){const {token}=useParams();return <QueueCheckInContent key={token} token={token} />;}
