import {useCallback,useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {request} from '../../api/client.js';
import {getSession,subscribeSession,clearSession} from '../auth/utils/session.js';
import {offerBundle} from './serviceBundle.js';
import {MAX_MANUAL_SERVICES,toggleManualService,secondsRemaining,offerActionState} from './manualQueueModel.js';
import {executeAccountAction} from './manualQueueActionV40.js';
import {createLatestRequestGate} from './requestOrderV42.js';
import {createSessionRequestEpoch} from './sessionRequestEpochV44.js';
import {parseManualQueueEntries} from './manualQueueReadGuard.js';
import {canSelfExitQueue} from './queueExitEligibility.js';

const clockTime=v=>new Date(v).toLocaleTimeString('uz-UZ',{timeZone:'Asia/Tashkent',hour:'2-digit',minute:'2-digit'});
export default function ManualQueue(){
 const [code,setCode]=useState(''),[entries,setEntries]=useState([]),[services,setServices]=useState({});
 const [selection,setSelection]=useState({}),[clock,setClock]=useState(Date.now());
 const [hasAccount,setHasAccount]=useState(()=>getSession()?.role==='customer'&&!!getSession()?.token);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [leaveConfirmId,setLeaveConfirmId]=useState(null);
 const [readFailed,setReadFailed]=useState(false);
 const [serviceErrors,setServiceErrors]=useState({});
 const inFlight=useRef(new Set());
 const readGate=useRef(createLatestRequestGate());
 const serviceEpoch=useRef(createSessionRequestEpoch());
 const sessionTokenRef=useRef(null);
 const getToken=()=>{const s=getSession();return s?.role==='customer'?s.token:null;};
 const clearPrivate=useCallback(()=>{
  readGate.current.invalidate();
  serviceEpoch.current.invalidate();
  inFlight.current.clear();
  setEntries([]);setServices({});setSelection({});setServiceErrors({});setLeaveConfirmId(null);
  setCode('');setNotice('');setError('');setReadFailed(false);
 },[]);
 const read=useCallback(async(signal)=>{
  const token=getToken();
  if(!token){clearPrivate();return;}
  const requestId=readGate.current.next();
  try{
   const data=await request('GET','/api/queue/manual/mine',{token,signal});
   // A prior user/expired token must never repopulate this page after logout.
   if(getToken()!==token||!readGate.current.isLatest(requestId))return; // ignore stale account or older refresh
   const parsed=parseManualQueueEntries(data);
   if(!parsed)throw Error('Navbat javobi noto‘g‘ri.');
   setEntries(parsed);setReadFailed(false);setError('');
  }catch(e){
   if(getToken()!==token||!readGate.current.isLatest(requestId))return;
   if(e.status===401){clearPrivate();clearSession();setHasAccount(false);}
   else if(e.status===403)clearPrivate();
   else {
    // Never display or act on stale queue state after an unsuccessful refresh.
    setReadFailed(true);setEntries([]);setLeaveConfirmId(null);
    setError('Navbat ma’lumotini yangilab bo‘lmadi. Qayta tekshiring.');
   }
   throw e;
  }
 },[clearPrivate]);
 useEffect(()=>{const controller=new AbortController();
  // subscribeSession also fires on same-tab logout and token expiry.
  const unsubscribe=subscribeSession(()=>{
   const current=getToken();setHasAccount(!!current);
   if(sessionTokenRef.current!==current){sessionTokenRef.current=current;clearPrivate();setBusy(false);}
   if(!current){setLoading(false);return;}
   void read(controller.signal).catch(e=>{if(!controller.signal.aborted&&getToken()===current&&e.status===401)setError(e.message);})
    .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  });
  return ()=>{controller.abort();unsubscribe();};
 },[read,clearPrivate]);
 useEffect(()=>{
  const timer=setInterval(()=>setClock(Date.now()),1000);
  const refresh=setInterval(()=>{if(document.visibilityState==='visible')void read().catch(()=>{});},10000);
  const onVisible=()=>{if(document.visibilityState==='visible')void read().catch(()=>{});};
  const onOnline=()=>void read().catch(()=>{});
  document.addEventListener('visibilitychange',onVisible);
  window.addEventListener('online',onOnline);
  return ()=>{clearInterval(timer);clearInterval(refresh);
   document.removeEventListener('visibilitychange',onVisible);
   window.removeEventListener('online',onOnline);};
 },[read]);
 useEffect(()=>{
  const token=getToken();if(!token)return;
  for(const entry of entries){
   const offer=entry.smart_offer;
   if(offerActionState(offer,Date.now())!=='accepted'||services[offer.id]||serviceErrors[offer.id]||inFlight.current.has(offer.id))continue;
   const epoch=serviceEpoch.current.capture();
   inFlight.current.add(offer.id);
   void request('POST',`/api/queue/offers/${offer.id}/services/customer`,{token})
    .then(data=>{if(getToken()===token&&serviceEpoch.current.isCurrent(epoch))setServices(prev=>({...prev,[offer.id]:data}));})
    .catch(e=>{if(getToken()===token&&serviceEpoch.current.isCurrent(epoch))setServiceErrors(prev=>({...prev,[offer.id]:e.message||'Xizmatlar olinmadi.'}));})
    .finally(()=>{if(serviceEpoch.current.isCurrent(epoch))inFlight.current.delete(offer.id);});
  }
 },[entries,services,serviceErrors]);
 async function run(action,{onSuccess,onFailure}={}){
  if(busy||readFailed)return;
  const token=getToken();
  if(!token){clearPrivate();return;}
  setBusy(true);setError('');setNotice('');
  await executeAccountAction({token,currentToken:getToken,action,
   onSuccess,onFailure:(e)=>{
    if(onFailure)onFailure(e);
    setError(e?.message||'Amal bajarilmadi.');
   },refresh:read,onComplete:()=>setBusy(false)});
 }
 function claim(event){event.preventDefault();void run(
  async token=>request('POST','/api/queue/manual/claim',{token,body:{code:code.trim().toLowerCase()}}),
  {onSuccess:()=>{setCode('');setNotice('Navbatingiz akkauntingizga bog‘landi. Takliflar shu sahifada ko‘rinadi.');}});
 }
 function decide(offer,action){void run(
  async token=>request('POST',`/api/queue/offers/${offer.id}/decision/customer`,{token,body:{action}}),
  {onSuccess:()=>setNotice(action==='accept'?'Taklif qabul qilindi, xizmatlarni tanlang.':'Taklif yangilandi.')});
 }
 function leave(id){void run(
  async token=>request('POST',`/api/queue/manual/${id}/leave`,{token}),
  {onSuccess:()=>{setLeaveConfirmId(null);setNotice('Navbatdan chiqdingiz. Tasdiqlangan bronlaringiz saqlanadi.');}});
 }
 function revoke(id){void run(
  async token=>request('POST',`/api/queue/manual/${id}/revoke`,{token}),
  {onSuccess:()=>setNotice('Navbatni akkauntga bog‘lash bekor qilindi. Navbatning o‘zi saqlanadi.')});
 }
 function confirm(offer){void run(async token=>{
  const catalog=services[offer.id],ids=selection[offer.id]||[];
  const quote=offerBundle(catalog?.services,ids,catalog?.duration_minutes);
  if(!quote.valid)throw Error('Vaqtga mos xizmatlarni tanlang.');
  return request('POST',`/api/queue/offers/${offer.id}/confirm-booking/customer`,{
   token,body:{service_ids:ids,expected_total_price:quote.totalPrice}});
 },{onSuccess:result=>setNotice(`Bron #${result.booking_id} tasdiqlandi. Bronlar sahifasidan ko‘ring.`),
  onFailure:error=>{
   if(['price_changed','service_unavailable','duration_mismatch'].includes(error.code)){
    setServices(prev=>{const next={...prev};delete next[offer.id];return next;});
    setSelection(prev=>({...prev,[offer.id]:[]}));
   }
  }});
 }
 return <div className="bx-page" style={{maxWidth:640,margin:'20px auto',padding:16,display:'grid',gap:16}}>
  <h1>Oddiy navbatim</h1>
  <p className="bx-muted">Sartarosh sizni QR ishlatmasdan navbatga qo‘shgan bo‘lsa, undan bir martalik kodni oling. Faqat o‘zingiz rozilik bersangiz akkauntingizga bog‘lanadi. Telegramga avtomatik ulanish yo‘q.</p>
  {!hasAccount&&<p role="status">Navbatingizni bog‘lash uchun mijoz akkauntiga kiring. <Link to="/login">Kirish</Link></p>}
  <form className="bx-card" style={{display:'grid',gap:8}} onSubmit={claim}>
   <label>Bir martalik kod (32 ta belgi)
    <input value={code} maxLength={32} autoComplete="off" spellCheck="false"
      onChange={e=>setCode(e.target.value)} placeholder="Sartarosh bergan kod" disabled={busy}/>
   </label>
   <button className="bx-btn bx-btn-primary" type="submit" disabled={busy||!hasAccount||readFailed||!/^[0-9a-f]{32}$/i.test(code.trim())}>Navbatimni bog‘lash</button>
  </form>
  {loading&&<p role="status">Navbat tekshirilmoqda…</p>}
  {readFailed&&hasAccount&&<div role="alert" className="bx-card">
   <p>Navbat ma’lumotini yangilab bo‘lmadi. Eski holat asosida amal bajarilmaydi.</p>
   <button type="button" className="bx-btn" onClick={()=>void read().catch(()=>{})}>Navbatni qayta tekshirish</button>
  </div>}
  {!loading&&!readFailed&&hasAccount&&entries.length===0&&<p>Bugun akkauntingizga bog‘langan faol navbat yo‘q.</p>}
  {entries.map(entry=>{
   const offer=entry.smart_offer,catalog=offer&&services[offer.id],offerState=offerActionState(offer,clock);
   const ids=offer?(selection[offer.id]||[]):[];
   const quote=offerBundle(catalog?.services,ids,catalog?.duration_minutes);
   return <section key={entry.id} className="bx-card" style={{display:'grid',gap:9}}>
    <strong>Navbat #{entry.id} · {entry.status==='in_service'?'Xizmat boshlandi':entry.status==='arrived'?'Kelganingiz tasdiqlandi':entry.status==='called'?'Sizni chaqirishdi':'Kutilmoqda'}</strong>
    {entry.queue_position!=null&&<p>Navbat tartibi: {entry.queue_position}</p>}
    {offer&&<div style={{display:'grid',gap:8}}>
     <h2>Bo‘shagan vaqt: {clockTime(offer.starts_at)}</h2>
     {offerState==='pending'?<>
      <p>Taklif tugashiga: <strong role="timer">{secondsRemaining(offer.expires_at,clock)} soniya</strong></p>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
       <button type="button" className="bx-btn bx-btn-primary" disabled={busy||secondsRemaining(offer.expires_at,clock)===0} onClick={()=>decide(offer,'accept')}>Qabul qilish</button>
       <button type="button" className="bx-btn" disabled={busy} onClick={()=>decide(offer,'reject')}>Rad etish</button>
      </div>
     </>:offerState==='accepted'?<>
      <p>Qabul qilindi, bron hali yaratilmagan. Tasdiqlashga: <strong role="timer">{secondsRemaining(offer.confirmation_deadline,clock)} soniya</strong></p>
      {catalog?.services?.length>0?<>
       <fieldset disabled={busy} style={{display:'grid',gap:7}}><legend>Xizmatlar — {catalog.duration_minutes} daqiqa</legend>
        {catalog.services.map(s=><label key={s.id} style={{display:'flex',alignItems:'center',gap:8}}>
         <input type="checkbox" checked={ids.includes(Number(s.id))}
          disabled={!ids.includes(Number(s.id))&&ids.length>=MAX_MANUAL_SERVICES}
          onChange={event=>setSelection(prev=>({...prev,[offer.id]:toggleManualService(ids,Number(s.id),event.target.checked)}))}/>
         {s.name} · {s.price} so‘m · {s.duration_minutes} daq.
        </label>)}
       </fieldset>
       <p>Jami: {quote.duration}/{catalog.duration_minutes} daqiqa · {quote.totalPrice||'—'} so‘m</p>
       <button type="button" className="bx-btn bx-btn-primary" disabled={busy||!quote.valid||secondsRemaining(offer.confirmation_deadline,clock)===0}
        onClick={()=>confirm(offer)}>Bronni tasdiqlash</button>
      </>:serviceErrors[offer.id]?<div role="alert" style={{display:'grid',gap:6}}>
       <p>{serviceErrors[offer.id]}</p>
       <button type="button" className="bx-btn" disabled={busy} onClick={()=>setServiceErrors(prev=>{const next={...prev};delete next[offer.id];return next;})}>Xizmatlarni qayta yuklash</button>
      </div>:<p>Faol xizmatlar topilmadi yoki yuklanmoqda.</p>}
      <button type="button" className="bx-btn" disabled={busy} onClick={()=>decide(offer,'cancel')}>Taklifni bekor qilish</button>
     </>:<p role="status">Taklif muddati tugagan yoki faol emas. Navbat holati avtomatik yangilanadi.</p>}
    </div>}
    {canSelfExitQueue(entry.status)&&(leaveConfirmId===entry.id?<div role="group" aria-label="Navbatdan chiqishni tasdiqlash" style={{display:'grid',gap:7}}>
     <p>Navbatdan butunlay chiqasiz. Qabul qilinmagan takliflar bekor bo‘ladi, tasdiqlangan bronlar saqlanadi.</p>
     <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <button type="button" className="bx-btn" disabled={busy} onClick={()=>setLeaveConfirmId(null)}>Ortga</button>
      <button type="button" className="bx-btn bx-btn-primary" disabled={busy} onClick={()=>leave(entry.id)}>Ha, navbatdan chiqish</button>
     </div>
    </div>:<button type="button" className="bx-btn" disabled={busy} onClick={()=>setLeaveConfirmId(entry.id)}>Navbatdan butunlay chiqish</button>)}
    <button type="button" className="bx-btn" disabled={busy} onClick={()=>revoke(entry.id)}>Akkauntimdan navbatni uzish (navbatda qolaman)</button>
   </section>;
  })}
  {notice&&<p role="status">{notice}</p>}
  {error&&<p className="bx-error" role="alert">{error}</p>}
  <Link to="/user/bookings">Bronlarim</Link>
 </div>;
}
