import { useLocation } from "react-router-dom";
import { readSiteLocale } from "../../utils/siteLocale.js";
import { qrSiteDestination } from "./data/v154QrSiteDestination.js";
import { barberInsightsText } from "./barberInsightsLocaleV147.js";
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {request} from '../../api/client.js';
import {getSession,subscribeSession} from '../auth/utils/session.js';
import {createLatestRequestGate} from '../queue/requestOrderV42.js';
import {parseBarberQueueSnapshot} from './data/barberQueueReadGuardV93.js';
import PageHeader from './components/PageHeader';
import {toISODate} from './data/store.js';
import {classifyQueue} from './data/queueModel.js';
import {callNextIntent,finishIntent,markArrivedIntent,startServiceIntent} from './data/queueMutationIntentV94.js';
import {createServiceFinishConfirmation,confirmServiceFinish,keepServiceFinishConfirmation} from './data/serviceFinishConfirmationV100.js';
import {createNoShowConfirmation,confirmNoShow,keepNoShowConfirmation} from './data/noShowConfirmationV105.js';
import {parseDayCloseReadiness,DAY_CLOSE_LABELS} from './data/dayCloseReadinessV106.js';
import {dayCloseIntent,dayReopenIntent,sameDayAction} from './data/dayCloseActionsV107.js';

const QUEUE_STATUS_LABELS = Object.freeze({
  waiting:'Kutyapti',called:'Chaqirildi',arrived:'Keldi',
  in_service:'Xizmat boshlandi',served:'Xizmat tugadi',missed:'Kelmadi',left:'Navbatdan chiqdi',
});
const OFFER_STATE_LABELS = Object.freeze({open:'Navbatdagi odam qidirilmoqda',offered:'Taklif yuborildi',accepted:'Mijoz bronni tasdiqlayapti',cancelled:'Bekor qilindi',closed:'Yopildi'});
const TELEGRAM_NOTICE_LABELS = Object.freeze({pending:'Navbatda',sending:'Yuborilmoqda',sent:'Yuborildi',failed:'Yetkazilmadi',uncertain:'Operator tekshiruvi',cancelled:'Bekor qilingan'});
const labelFor=(status,tr)=>tr(QUEUE_STATUS_LABELS[status]||status);

const timeFor = value => value ? new Intl.DateTimeFormat('uz-UZ',{
  timeZone:'Asia/Tashkent',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
}).format(new Date(value)) : '—';

export default function Queue() {
  const lang=readSiteLocale(useLocation().search);
  const tr=useMemo(()=>barberInsightsText(lang),[lang]);
  const [active,setActive]=useState([]),[recent,setRecent]=useState([]);
  const [label,setLabel]=useState(''),[loading,setLoading]=useState(true);
  const [claimCode,setClaimCode]=useState(null);
  const [qr,setQr]=useState(null),[qrPending,setQrPending]=useState([]),[openings,setOpenings]=useState([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [finishConfirmation,setFinishConfirmation]=useState(null);
  const [noShowConfirmation,setNoShowConfirmation]=useState(null);
  const [dayClose,setDayClose]=useState(null),[dayCloseBusy,setDayCloseBusy]=useState(false),[dayCloseError,setDayCloseError]=useState('');
  const [dayCloseConfirmation,setDayCloseConfirmation]=useState(null);
  const dayCloseRequest=useRef(0);
  const pendingRequest=useRef(null);
  const readGate=useRef(createLatestRequestGate());
  const readyRef=useRef(false);
  const actionLock=useRef(false);
  const accountRef=useRef(null);
  const [readFailed,setReadFailed]=useState(true);
  const [sessionEpoch,setSessionEpoch]=useState(0);
  const sameBarber=token=>{const current=getSession();return current?.role==='barber'&&current.token===token;};
  const clearQueue=useCallback(()=>{
    readyRef.current=false;readGate.current.invalidate();
    setActive([]);setRecent([]);setQrPending([]);setOpenings([]);
    setClaimCode(null);setQr(null);setReadFailed(true);setFinishConfirmation(null);setNoShowConfirmation(null);
    dayCloseRequest.current+=1;
    setDayClose(null);setDayCloseError('');setDayCloseBusy(false);setDayCloseConfirmation(null);
  },[]);
  const startAction=(changesQueue=false)=>{
    const s=getSession();
    if(s?.role!=='barber'||!s.token){setError(tr('Qayta tizimga kiring.'));return null;}
    if(!readyRef.current||actionLock.current){setError(tr('Navbatni yangilang va qayta tekshiring.'));return null;}
    actionLock.current=true;readGate.current.invalidate();setFinishConfirmation(null);setNoShowConfirmation(null);
    if(changesQueue){readyRef.current=false;setReadFailed(true);dayCloseRequest.current+=1;setDayClose(null);setDayCloseBusy(false);setDayCloseConfirmation(null);}
    setBusy(true);setError('');setNotice('');
    return {token:s.token,epoch:sessionEpoch};
  };
  const endAction=({token,epoch})=>{
    if(sameBarber(token)&&epoch===sessionEpoch){actionLock.current=false;setBusy(false);}
  };
  const read=useCallback(async(signal)=>{
    const session=getSession();
    const token=session?.role==='barber'?session.token:null;
    if(!token){clearQueue();throw Error(tr('Sartarosh sessiyasi kerak.'));}
    const requestId=readGate.current.next();
    try{
      const data=await request('GET','/api/queue/mine',{token,signal});
      const qrData=await request('GET','/api/queue/qr-pending',{token,signal});
      const offersData=await request('GET','/api/queue/offers/mine',{token,signal});
      if(!sameBarber(token)||!readGate.current.isLatest(requestId))return;
      const parsed=parseBarberQueueSnapshot(data,qrData,offersData);
      if(!parsed)throw Error(tr('Navbat javobi noto‘g‘ri.'));
      if(parsed.active.length || parsed.pending.length ||
        parsed.openings.some(o=>['open','offered','accepted'].includes(o.state))){
        dayCloseRequest.current+=1;setDayCloseBusy(false);setDayClose(null);setDayCloseConfirmation(null);
      }
      setActive(parsed.active);setRecent(parsed.recent);
      setQrPending(parsed.pending);setOpenings(parsed.openings);
      setFinishConfirmation(current=>keepServiceFinishConfirmation(current,parsed.active));
      setNoShowConfirmation(current=>keepNoShowConfirmation(current,parsed.active));
      readyRef.current=true;setReadFailed(false);setError('');
    }catch(e){
      if(sameBarber(token)&&readGate.current.isLatest(requestId)&&!signal?.aborted){
        clearQueue();setError(tr('Navbat ma’lumotini yangilab bo‘lmadi. Qayta tekshiring.'));
      }
      throw e;
    }
  },[clearQueue,tr]);
  useEffect(()=>{
    const controller=new AbortController();
    const unsubscribe=subscribeSession(()=>{
      const s=getSession();const token=s?.role==='barber'?s.token:null;
      if(accountRef.current===token)return;
      accountRef.current=token;actionLock.current=false;pendingRequest.current=null;
      clearQueue();setBusy(false);setNotice('');setError('');setLoading(!!token);
      setSessionEpoch(n=>n+1);
      if(token)void read(controller.signal).catch(()=>{}).finally(()=>{
        if(!controller.signal.aborted&&sameBarber(token))setLoading(false);
      });
    });
    return ()=>{controller.abort();unsubscribe();readGate.current.invalidate();};
  },[read,clearQueue]);
  useEffect(()=>{
    const controller=new AbortController();
    const interval=setInterval(()=>{
      if(document.visibilityState==='visible'&&!actionLock.current)void read(controller.signal).catch(()=>{});
    },15000);
    const visible=()=>{if(document.visibilityState==='visible'&&!actionLock.current)void read(controller.signal).catch(()=>{});};
    document.addEventListener('visibilitychange',visible);
    window.addEventListener('online',visible);
    return ()=>{clearInterval(interval);controller.abort();
      document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',visible);};
  },[read]);
  async function action(path,body,after){
    const ctx=startAction(true);if(!ctx)return;
    try{
      const result=await request('POST',path,{token:ctx.token,body});
      if(!sameBarber(ctx.token))return;
      if(after)after(result);
      setNotice(result?.replayed?tr('Amal oldin bajarilgan, holat yangilandi.'):tr('Amal saqlandi.'));
      try{await read();}catch{if(sameBarber(ctx.token))setError(tr('Amal natijasini qayta tekshiring.'));}
    }catch(e){if(sameBarber(ctx.token)){clearQueue();setError(e.code==='queue_result_unknown'
      ?tr('Amal natijasi noaniq. Yangilang; qayta yubormang.'):e.message||tr('Amal bajarilmadi.'));}}
    finally{endAction(ctx);}
  }
  async function markArrived(entry){
    const intent=markArrivedIntent(entry);
    if(!intent){setError('Chaqirilgan navbatni yangilang.');return;}
    await action(`/api/queue/${intent.id}/arrive`,intent.body);
  }
  async function startService(entry){
    const intent=startServiceIntent(entry);
    if(!intent){setError('Chaqirilgan navbatni yangilang.');return;}
    await action(`/api/queue/${intent.id}/start`,intent.body);
  }
  function askFinishConfirmation(entry) {
    if(!readyRef.current||readFailed||loading||busy||actionLock.current){
      setError(tr('Navbatni yangilang va qayta tekshiring.'));return;
    }
    const pending=createServiceFinishConfirmation(entry,getSession(),sessionEpoch);
    if(!pending){setError('Xizmat holatini yangilang.');return;}
    setFinishConfirmation(pending);setError('');setNotice('');
  }
  async function acceptFinishConfirmation(){
    const entry=active.find(row=>row.id==finishConfirmation?.id);
    const intent=confirmServiceFinish(finishConfirmation,entry,getSession(),sessionEpoch);
    setFinishConfirmation(null);
    if(!intent || !readyRef.current || readFailed || loading || busy || actionLock.current){
      setError(tr('Tasdiq eskirgan yoki navbat o‘zgargan. Yangilang va qayta tekshiring.'));return;
    }
    await finish(entry,'served');
  }
  function askNoShowConfirmation(entry) {
    if(!readyRef.current||readFailed||loading||busy||actionLock.current){
      setError(tr('Navbatni yangilang va qayta tekshiring.'));return;
    }
    const pending=createNoShowConfirmation(entry,getSession(),sessionEpoch);
    if(!pending){setError('Chaqirilgan mijoz holatini yangilang.');return;}
    setFinishConfirmation(null);setNoShowConfirmation(pending);setError('');setNotice('');
  }
  async function acceptNoShowConfirmation(){
    const entry=active.find(row=>row.id===noShowConfirmation?.id);
    const intent=confirmNoShow(noShowConfirmation,entry,getSession(),sessionEpoch);
    setNoShowConfirmation(null);
    if(!intent||!readyRef.current||readFailed||loading||busy||actionLock.current){
      setError(tr('Tasdiq eskirgan yoki navbat o‘zgargan. Yangilang va qayta tekshiring.'));return;
    }
    await finish(entry,'missed');
  }
  async function finish(entry,status){
    const intent=finishIntent(entry,status);
    if(!intent){setError(tr('Navbat holatini yangilang va qayta tekshiring.'));return;}
    const ctx=startAction(true);if(!ctx)return;
    try{
      const result=await request('PATCH',`/api/queue/${intent.id}/finish`,{token:ctx.token,body:intent.body});
      if(!sameBarber(ctx.token))return;
      setNotice(result?.replayed?'Holat avval saqlangan.':'Navbat holati saqlandi.');
      try{await read();}catch{if(sameBarber(ctx.token))setError('Natijani yangilab bo‘lmadi. Qayta tekshiring.');}
    }catch(e){if(sameBarber(ctx.token)){clearQueue();setError(e.code==='queue_result_unknown'
      ?tr('Navbat holati noaniq. Qayta tekshiring; amalni takrorlamang.'):e.message||tr('Amal bajarilmadi.'));}}
    finally{endAction(ctx);}
  }
  async function generateQr(){
    const ctx=startAction();if(!ctx)return;
    try{
      const data=await request('POST','/api/queue/qr-tokens',{token:ctx.token,
        body:qrSiteDestination(window.location.origin,import.meta.env.BASE_URL,lang)});
      if(sameBarber(ctx.token))setQr(data);
    }catch(e){if(sameBarber(ctx.token)){setQr(null);setError(e.message||tr('QR yaratilmadi.'));}}
    finally{endAction(ctx);}
  }
  async function decide(id,decision){
    const ctx=startAction(true);if(!ctx)return;
    try{
      const data=await request('PATCH',`/api/queue/qr-pending/${id}`,{token:ctx.token,body:{decision}});
      if(!sameBarber(ctx.token))return;
      setNotice(data?.replayed?tr('Bu so‘rov avval ko‘rib chiqilgan.'):decision==='approve'?tr('Mehmon navbatga qo‘shildi.'):tr('QR so‘rovi rad etildi.'));
      try{await read();}catch{if(sameBarber(ctx.token))setError('Natijani yangilab bo‘lmadi. Qayta tekshiring.');}
    }catch(e){if(sameBarber(ctx.token)){clearQueue();setError(e.message||'Qaror natijasi noaniq. Qayta tekshiring.');}}
    finally{endAction(ctx);}
  }
  async function issueClaimCode(id){
    const ctx=startAction();if(!ctx)return;setClaimCode(null);
    try{
      const data=await request('POST',`/api/queue/walk-ins/${id}/claim-code`,{token:ctx.token});
      if(!sameBarber(ctx.token))return;
      setClaimCode(data);setNotice(tr('Bir martalik kod yaratildi. Uni faqat navbat egasiga bering.'));
    }catch(e){if(sameBarber(ctx.token)){setClaimCode(null);setError(e.message||tr('Kod yaratilmadi.'));}}
    finally{endAction(ctx);}
  }
  async function cancelOpening(id){
    const ctx=startAction(true);if(!ctx)return;
    try{
      await request('PATCH',`/api/queue/offers/${id}/cancel`,{token:ctx.token});
      if(!sameBarber(ctx.token))return;
      setNotice(tr('Taklif bekor qilindi.'));await read();
    }catch(e){if(sameBarber(ctx.token)){clearQueue();setError(e.message||'Taklifni bekor qilib bo‘lmadi. Qayta tekshiring.');}}
    finally{endAction(ctx);}
  }
  async function move(id,direction,order){
    if(!readyRef.current||actionLock.current){setError(tr('Navbatni yangilang.'));return;}
    const reason=window.prompt(tr('Navbat tartibini o‘zgartirish sababini yozing (10–200 belgi):'));
    if(reason===null)return;
    if(reason.trim().length<10||reason.trim().length>200){setError(tr('Sabab 10–200 belgidan iborat bo‘lishi kerak.'));return;}
    const ctx=startAction(true);if(!ctx)return;
    try{
      await request('PATCH',`/api/queue/${id}/reorder`,{token:ctx.token,body:{direction,reason:reason.trim(),expected_order:order}});
      if(!sameBarber(ctx.token))return;
      setNotice(tr('Navbat tartibi va sabab audit tarixiga yozildi.'));await read();
    }catch(e){if(sameBarber(ctx.token)){clearQueue();setError(e.message||'Navbat tartibini yangilab bo‘lmadi. Qayta tekshiring.');}}
    finally{endAction(ctx);}
  }
  async function checkDayClose(){
    const session=getSession();
    if(!session?.token||session.role!=='barber'||busy||actionLock.current){setDayCloseError(tr('Navbatni tekshirish uchun qayta kiring.'));return;}
    const token=session.token,epoch=sessionEpoch,nonce=++dayCloseRequest.current;
    setDayCloseBusy(true);setDayClose(null);setDayCloseError('');setDayCloseConfirmation(null);
    try{
      const data=await request('GET','/api/queue/day-close/preview',{token});
      if(!sameBarber(token)||epoch!==sessionEpoch||nonce!==dayCloseRequest.current)return;
      const parsed=parseDayCloseReadiness(data);
      if(!parsed)throw Error(tr('Kun yakuni javobi noto‘g‘ri.'));
      setDayClose(parsed);
    }catch(e){if(sameBarber(token)&&epoch===sessionEpoch&&nonce===dayCloseRequest.current){setDayClose(null);setDayCloseError(e.message||'Kun yakuni tekshirilmagan.');}}
    finally{if(sameBarber(token)&&epoch===sessionEpoch&&nonce===dayCloseRequest.current)setDayCloseBusy(false);}
  }
  function askDayClose(){
    if(!readyRef.current||readFailed||loading||busy||dayCloseBusy||actionLock.current){
      setDayCloseError(tr('Navbat holatini yangilang.'));return;
    }
    const intent=dayCloseIntent(dayClose,getSession(),sessionEpoch);
    if(!intent){setDayCloseError(tr('Tasdiq eskirgan. Kun yakunini yangidan tekshiring.'));return;}
    setDayCloseConfirmation({type:'close',intent});setDayCloseError('');
  }
  function askDayReopen(){
    if(!readyRef.current||readFailed||loading||busy||dayCloseBusy||actionLock.current){
      setDayCloseError(tr('Navbat holatini yangilang.'));return;
    }
    const intent=dayReopenIntent(dayClose,getSession(),sessionEpoch);
    if(!intent){setDayCloseError(tr('Kun yakuni holatini yangidan tekshiring.'));return;}
    setDayCloseConfirmation({type:'reopen',intent});setDayCloseError('');
  }
  async function confirmDayAction(){
    const proposed=dayCloseConfirmation;
    setDayCloseConfirmation(null);
    if(!proposed || !sameDayAction(proposed.intent,getSession(),sessionEpoch)
       || !readyRef.current || readFailed || loading || busy || actionLock.current){
      setDayCloseError(tr('Tasdiq eskirgan. Yangi tekshiruv talab qilinadi.'));return;
    }
    const ctx=startAction(true);if(!ctx)return;
    try{
      const endpoint=proposed.type==='close'?'/api/queue/day-close':'/api/queue/day-close/reopen';
      const result=await request('POST',endpoint,{token:ctx.token,body:proposed.intent.body});
      if(!sameBarber(ctx.token)||ctx.epoch!==sessionEpoch)return;
      setNotice(result?.replayed?tr('Kun holati avval saqlangan.'):result?.closed?tr('Bugungi ish kuni yopildi.'):tr('Bugungi ish kuni qayta ochildi.'));
      await read().catch(()=>{});
    }catch(e){
      if(sameBarber(ctx.token)&&ctx.epoch===sessionEpoch){
        clearQueue();setDayCloseError(e.code==='queue_result_unknown'
          ?tr('Natija noaniq. Qayta tasdiqlamang; avval holatni tekshiring.')
          :e.message||tr('Kun holatini o‘zgartirib bo‘lmadi.'));
      }
    }finally{
      endAction(ctx);
    }
    // Require a fresh, authoritative status after every closure write.
    if(sameBarber(ctx.token)&&ctx.epoch===sessionEpoch){
      await checkDayClose();
    }
  }
  const today=toISODate();
  const {called,waiting,oldActive}=classifyQueue(active,today);
  function add(event){
    event.preventDefault();
    if(!pendingRequest.current){
      pendingRequest.current=crypto.randomUUID().replaceAll('-','');
    }
    void action('/api/queue/walk-ins',{request_id:pendingRequest.current,label:label.trim()||'Mehmon'},()=>{
      pendingRequest.current=null;setLabel('');
    });
  }
  return <div className="bx-page">
    <PageHeader title={tr("Navbat")} subtitle="Hozir kelgan mijozlar — walk-in" />
    <section className="bx-card" style={{display:'grid',gap:12}}>
      <h2>{tr("Mehmonni navbatga qo‘shish")}</h2>
      {dayClose?.closed===true&&<p role="status">{tr("Bugungi kun yopilgan. Yangi navbat va QR yaratish uchun avval kunni qayta oching.")}</p>}
      <p className="bx-muted">{tr("Mijoz hozir shu yerda bo‘lsa qo‘shing. Qator tartibi serverda saqlanadi. Bu amal bron vaqtini avtomatik band qilmaydi. Ish vaqti tugagach yangi navbat ochilmaydi.")}</p>
      <form onSubmit={add} style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <label style={{flex:'1 1 200px'}}>{tr("Mijoz belgisi (ixtiyoriy)")}
          <input type="text" value={label} maxLength={60} disabled={busy||readFailed||loading||dayClose?.closed===true} placeholder={tr("Mehmon")} onChange={e=>{setLabel(e.target.value);pendingRequest.current=null;}} />
        </label>
        <button type="submit" className="bx-btn bx-btn-primary" disabled={busy||readFailed||loading||dayClose?.closed===true}>{tr("+ Navbatga qo‘shish")}</button>
      </form>
    </section>
    <section className="bx-card" style={{display:'grid',gap:12}}>
      <h2>{tr("QR orqali navbatga so‘rov")}</h2>
      <p className="bx-muted">{tr("QR muddati Admin sozlamasida belgilanadi va faqat bir marta ishlaydi. Mehmon so‘rov yuborgach, siz tasdiqlamaguncha navbatga qo‘shilmaydi. Tasdiqlashdan oldin mehmon haqiqatan shu yerda ekanini tekshiring.")}</p>
      <div><button type="button" className="bx-btn bx-btn-primary" disabled={busy||readFailed||loading||dayClose?.closed===true} onClick={()=>void generateQr()}>{tr("Yangi QR yaratish")}</button></div>
      {qr&&<div style={{display:'grid',gap:8,justifyItems:'start'}}>
        <img src={qr.svg_data_uri} alt={tr("Navbat uchun QR kodi")} width={240} height={240} style={{background:'white',padding:8,borderRadius:12}} />
        <small className="bx-muted">{tr('QR muddati: ')}{qr.ttl_minutes}{tr(' daqiqa (soat ')}{new Date(qr.expires_at).toLocaleTimeString(lang==='ru'?'ru-RU':lang==='en'?'en-GB':'uz-UZ')})</small>
        <a href={qr.url} target="_blank" rel="noopener noreferrer">{tr("QR havolasini ochish")}</a>
      </div>}
      <h3>{tr('Tasdiqlashni kutayotganlar: ')}{qrPending.length}</h3>
      {qrPending.length===0?<p className="bx-muted">{tr("Hozircha QR so‘rovi yo‘q.")}</p>:<ul style={{listStyle:'none',padding:0,display:'grid',gap:8}}>
        {qrPending.map(item=><li key={item.id} style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}>
          <span><strong>{item.display_label}</strong> <small className="bx-muted">{timeFor(item.created_at)}</small></span>
          <div style={{display:'flex',gap:8}}>
            <button type="button" className="bx-btn bx-btn-primary" disabled={busy||readFailed||loading} onClick={()=>void decide(item.id,'approve')}>{tr("Tasdiqlash")}</button>
            <button type="button" className="bx-btn" disabled={busy||readFailed||loading} onClick={()=>void decide(item.id,'reject')}>{tr("Rad etish")}</button>
          </div>
        </li>)}
      </ul>}
      <button type="button" className="bx-btn" disabled={busy||loading} onClick={()=>void read().catch(()=>{})}>{tr("So‘rovlarni yangilash")}</button>
    </section>
    <section className="bx-card" style={{display:'grid',gap:12}}>
      <h2>{tr("Bugungi bo‘shagan vaqt takliflari")}</h2>
      <p className="bx-muted">{tr("QR bilan tasdiqlangan yoki o‘z roziligi bilan akkauntini bog‘lagan oddiy navbatdagi mijozlarga 5 daqiqalik imkoniyat beriladi. Qabul qilingan taklif faqat mijoz akkaunti orqali yakuniy tasdiqlangach bron hisoblanadi.")}</p>
      {openings.length===0?<p className="bx-muted">{tr("Hozircha taklif yo‘q.")}</p>:<ul style={{display:'grid',gap:8}}>
       {openings.map(o=><li key={o.id}>
        {timeFor(o.start_at)} · {o.duration_minutes} {tr("daqiqa")} · {tr(OFFER_STATE_LABELS[o.state]||o.state)}
        {o.display_label&&<> · {o.display_label}</>}
        {o.booking_id&&<> · <strong>{tr('Bron #{id} tasdiqlandi',{id:o.booking_id})}</strong></>}
        {o.telegram_notice_status&&<> · Telegram: {tr(TELEGRAM_NOTICE_LABELS[o.telegram_notice_status]||o.telegram_notice_status)}</>}
        {o.state==='offered'&&o.expires_at&&<> · {tr('tugaydi ')}{timeFor(o.expires_at)}</>}
        {['open','offered'].includes(o.state)&&<button type="button" className="bx-btn" disabled={busy||readFailed||loading} onClick={()=>void cancelOpening(o.id)}>{tr("Taklifni bekor qilish")}</button>}
       </li>)}
      </ul>}
    </section>
    <section className="bx-card" style={{display:'grid',gap:10}}>
      <h2>{tr("Ish kunini xavfsiz yakunlash")}</h2>
      <p className="bx-muted">{tr("Yopish avval barcha ochiq navbat, QR, bron va takliflar tugaganini serverda qayta tekshiradi. Hech qanday mijoz avtomatik bekor qilinmaydi. Har bir amal auditda qayd etiladi.")}</p>
      <button type="button" className="bx-btn" disabled={busy||loading||readFailed||dayCloseBusy}
        onClick={()=>void checkDayClose()}>{dayCloseBusy?tr('Tekshirilmoqda…'):tr('Kun holatini tekshirish / yangilash')}</button>
      {dayCloseError&&<p role="alert" className="bx-error">{dayCloseError}</p>}
      {dayClose&&<div role="status" style={{display:'grid',gap:6}}>
        <strong>{dayClose.queue_date} · {dayClose.closed?tr('Kun yopilgan'):dayClose.ready?tr('Yopishga tayyor'):tr('Yakunlanmagan ishlar mavjud')}</strong>
        <small className="bx-muted">{tr('Server tekshirgan vaqt: ')}{timeFor(dayClose.as_of)}{tr('. Boshqa kunlar avtomatik ochiq qoladi.')}</small>
        <ul>{Object.entries(DAY_CLOSE_LABELS).map(([key,label])=><li key={key}>{tr(label)}: {dayClose.counts[key]}</li>)}</ul>
        {dayClose.blockers.length>0&&<p className="bx-muted">{tr("Avval ochiq ishlarni alohida ko‘rib chiqing. Avtomatik yakunlash amalga oshirilmaydi.")}</p>}
        {!dayClose.closed && dayClose.ready&&<button type="button" className="bx-btn bx-btn-primary" disabled={busy||loading||readFailed}
          onClick={askDayClose}>{tr("Bugungi ish kunini yopish…")}</button>}
        {dayClose.closed&&<button type="button" className="bx-btn" disabled={busy||loading||readFailed}
          onClick={askDayReopen}>{tr("Bugungi ish kunini qayta ochish…")}</button>}
      </div>}
      {dayCloseConfirmation&&<div role="group" aria-label={tr("Kun yakuni tasdig‘i")} className="bx-card" style={{display:'grid',gap:8}}>
        <strong>{dayCloseConfirmation.type==='close'?tr('Bugungi ish kunini yopasizmi?'):tr('Bugungi ish kunini qayta ochasizmi?')}</strong>
        <p className="bx-muted">{dayCloseConfirmation.type==='close'
          ?tr('Yangi navbat va bugungi yangi bronlar qabul qilinmaydi. Avvalgi mijozlar avtomatik bekor qilinmaydi. Tasdiq 30 soniya amal qiladi.')
          :tr('Yangi navbat va bronlar yana odatiy ish jadvaliga muvofiq qabul qilinishi mumkin. Tasdiq 30 soniya amal qiladi.')}</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button type="button" className="bx-btn bx-btn-primary" disabled={busy||loading||readFailed}
            onClick={()=>void confirmDayAction()}>{tr("Ha, tasdiqlayman")}</button>
          <button type="button" className="bx-btn" onClick={()=>setDayCloseConfirmation(null)}>{tr("Yo‘q, qaytish")}</button>
        </div>
      </div>}
    </section>
    <section className="bx-card" style={{display:'grid',gap:12}}>
      <h2>{tr("Hozirgi navbat")}</h2>
      <p className="bx-muted">{tr("Oddiy navbat egasi o‘z akkauntida Smart Booking taklifini ko‘rishni istasa, uning oldida bir martalik kod yarating. Kod 15 daqiqa amal qiladi; yangisi eskisini bekor qiladi.")}</p>
      {claimCode&&<div role="status" className="bx-card" style={{display:'grid',gap:8}}>
       <strong>{tr('Navbat #{id} — bir martalik kod',{id:claimCode.entry_id})}</strong>
       <code style={{wordBreak:'break-all'}}>{claimCode.code}</code>
       <small>{tr('Yaroqli: {time} gacha. Faqat mijozga ulashing.',{time:timeFor(claimCode.expires_at)})}</small>
       <button type="button" className="bx-btn" onClick={()=>setClaimCode(null)}>{tr("Kodni yashirish")}</button>
      </div>}
      <p className="bx-muted">{tr('Kutayotganlar: {count}. Navbat 15 soniyada yangilanadi; tarmoq uzilsa, yangilash tugmasidan foydalaning.',{count:waiting.length})}</p>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <button type="button" className="bx-btn bx-btn-primary" disabled={busy||loading||readFailed||!!called||!waiting.length}
          onClick={()=>{
            const intent=callNextIntent(called,waiting);
            if(!intent){setError(tr('Navbatni yangilang.'));return;}
            void action('/api/queue/call-next',intent);
          }}>{tr("Keyingisini chaqirish (FIFO)")}</button>
        <button type="button" className="bx-btn" disabled={busy||loading} onClick={()=>{
          setLoading(true);setError('');read().catch(()=>{}).finally(()=>setLoading(false));
        }}>{tr("Yangilash")}</button>
      </div>
      {loading&&<p role="status">{tr("Navbat yuklanmoqda…")}</p>}
      {readFailed&&!loading&&<p role="alert" className="bx-error">{tr("Navbat holati tasdiqlanmagan. Barcha amallar vaqtincha bloklangan. Yangilang.")}</p>}
      {called&&<div className="bx-card" style={{display:'grid',gap:8}}>
        <strong>{called.status==='in_service'?tr('Xizmat boshlandi'):called.status==='arrived'?tr('Keldi'):tr('Chaqirilgan')}: #{called.id} · {called.display_label}</strong>
        <p className="bx-muted">{timeFor(called.called_at)}{tr(' da chaqirildi')}</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {called.status==='called'&&<button type="button" className="bx-btn bx-btn-primary" disabled={busy||readFailed||loading}
            onClick={()=>void markArrived(called)}>{tr("Keldi")}</button>}
          {called.status==='arrived'&&<button type="button" className="bx-btn bx-btn-primary" disabled={busy||readFailed||loading}
            onClick={()=>void startService(called)}>{tr("Xizmat boshlandi")}</button>}
          {called.status==='in_service'&&<button type="button" className="bx-btn bx-btn-primary" disabled={busy||readFailed||loading}
            onClick={()=>askFinishConfirmation(called)}>{tr("Xizmat tugadi")}</button>}
          {['called','arrived'].includes(called.status)&&<>
            {called.status==='called'&&<button type="button" className="bx-btn" disabled={busy||readFailed||loading} onClick={()=>askNoShowConfirmation(called)}>{tr("Kelmadi")}</button>}
            <button type="button" className="bx-btn" disabled={busy||readFailed||loading} onClick={()=>void finish(called,'left')}>{tr("Chiqib ketdi")}</button>
          </>}
        </div>
      </div>}
      {noShowConfirmation&&called?.status==='called'&&<div className="bx-card" role="group" aria-label={tr("Kelmadi holatini tasdiqlash")} style={{display:'grid',gap:8}}>
        <strong>{tr('#{id} mijoz haqiqatan kelmadimi?',{id:noShowConfirmation.id})}</strong>
        <p className="bx-muted">{tr("«Ha» bosilsa navbat «Kelmadi» deb yakunlanadi. Mijoz kelgan bo‘lsa, «Yo‘q»ni tanlang.")}</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button type="button" className="bx-btn bx-btn-primary" disabled={busy||loading||readFailed}
            onClick={()=>void acceptNoShowConfirmation()}>{tr("Ha, kelmadi")}</button>
          <button type="button" className="bx-btn" onClick={()=>setNoShowConfirmation(null)}>{tr("Yo‘q, qaytish")}</button>
        </div>
      </div>}
      {finishConfirmation&&called?.status==='in_service'&&<div className="bx-card" role="group" aria-label={tr("Xizmatni yakunlash tasdig‘i")} style={{display:'grid',gap:8}}>
        <strong>{tr('#{id} mijozning xizmati tugadimi?',{id:finishConfirmation.id})}</strong>
        <p className="bx-muted">{tr("«Ha» bosilsa navbat yakunlanadi. Bu amalni keyin oddiy tugma bilan qaytarib bo‘lmaydi.")}</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button type="button" className="bx-btn bx-btn-primary" disabled={busy||loading||readFailed}
            onClick={()=>void acceptFinishConfirmation()}>{tr("Ha, tugadi")}</button>
          <button type="button" className="bx-btn" onClick={()=>setFinishConfirmation(null)}>{tr("Yo‘q, qaytish")}</button>
        </div>
      </div>}
      {waiting.length===0&&!called&&!loading&&<p className="bx-muted">{tr("Hozir kutayotgan mijoz yo‘q.")}</p>}
      {waiting.length>0&&<ol style={{display:'grid',gap:8,paddingInlineStart:24}}>
        {waiting.map((entry,index)=><li key={entry.id}>
          <div style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}>
            <span><strong>#{entry.id} · {entry.display_label}</strong><br/><small className="bx-muted">{timeFor(entry.created_at)} · {entry.queue_date}</small></span>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              <button type="button" className="bx-btn" disabled={busy||loading||readFailed||entry.is_qr||entry.manual_linked} onClick={()=>void issueClaimCode(entry.id)}>{entry.is_qr?tr('QR navbat'):entry.manual_linked?tr('Bog‘langan'):tr('Mijoz uchun kod')}</button>
              <button type="button" className="bx-btn" disabled={busy||loading||readFailed||index===0} onClick={()=>void move(entry.id,'up',waiting.map(item=>item.id))} aria-label={`${entry.display_label}${tr(' yuqoriga')}`}>↑</button>
              <button type="button" className="bx-btn" disabled={busy||loading||readFailed||index===waiting.length-1} onClick={()=>void move(entry.id,'down',waiting.map(item=>item.id))} aria-label={`${entry.display_label}${tr(' pastga')}`}>↓</button>
              <button type="button" className="bx-btn" disabled={busy||readFailed||loading} onClick={()=>void finish(entry,'left')}>{tr("Navbatdan chiqarish")}</button>
            </div>
          </div>
        </li>)}
      </ol>}
      {oldActive.length>0&&<div className="bx-card" style={{display:'grid',gap:8}}>
        <h3>{tr("Oldingi kunlardan qolganlar")}</h3>
        <p className="bx-muted">{tr("Bu yozuvlar bugungi FIFO chaqiruviga qo‘shilmaydi. Ularni bugungi navbat tugmasi bilan yakunlab bo‘lmaydi; alohida tekshirish kerak.")}</p>
        {oldActive.map(entry=><div key={entry.id} style={{display:'flex',gap:8,justifyContent:'space-between',flexWrap:'wrap'}}>
          <span>#{entry.id} · {entry.display_label} · {entry.queue_date} · {labelFor(entry.status,tr)}</span>

        </div>)}
      </div>}
    </section>
    <section className="bx-card">
      <h2>{tr("Oxirgi yakunlanganlar")}</h2>
      {recent.length===0?<p className="bx-muted">{tr("Hali tarix yo‘q.")}</p>:<ul style={{listStyle:'none',padding:0,display:'grid',gap:8}}>
        {recent.map(entry=><li key={entry.id}>#{entry.id} · {entry.display_label} · {labelFor(entry.status,tr)}</li>)}
      </ul>}
    </section>
    {!!notice&&<p role="status">{notice}</p>}
    {!!error&&<p role="alert" className="bx-error">{error}</p>}
    <p className="bx-muted">{tr("Navbat tartibini o‘zgartirish sabab bilan auditga yoziladi. Telegram navbat chaqiruvi opt-in bo‘yicha ishlaydi. Bo‘shagan vaqt taklifi bronni avtomatik band qilmaydi.")}</p>
  </div>;
}
