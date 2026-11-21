import {useEffect,useRef,useState} from 'react';
import {request} from '../../../api/client.js';
import {formatWait} from '../../queue/qrModel.js';
import {socialQueueText,localizeQueueWait} from '../social/socialQueueLocaleV149.js';
import {createPublicQueueRequestRunner,parsePublicQueueSummary} from './publicQueueModel.js';

export default function PublicQueueSummary({barberId,lang="uz"}) {
 const tr=socialQueueText(lang);
 const [view,setView]=useState({barberId:null,status:'loading',value:null});
 const refreshRef=useRef(null);
 useEffect(()=>{
  setView({barberId,status:'loading',value:null});
  const runner=createPublicQueueRequestRunner(
   (id,signal)=>request('GET',`/api/queue/public/${id}`,{signal}),setView);
  const refresh=()=>runner.refresh(barberId);
  refreshRef.current=refresh;
  void refresh();
  const timer=setInterval(()=>{
   if(document.visibilityState==='visible')void refresh();
  },30000);
  const onVisible=()=>{
   if(document.visibilityState==='visible'){
    setView({barberId,status:'loading',value:null});
    void refresh();
   }
  };
  const onOnline=()=>{
   if(document.visibilityState==='visible')void refresh();
  };
  document.addEventListener('visibilitychange',onVisible);
  window.addEventListener('online',onOnline);
  window.addEventListener('focus',onOnline);
  return ()=>{
   clearInterval(timer);
   document.removeEventListener('visibilitychange',onVisible);
   window.removeEventListener('online',onOnline);
   window.removeEventListener('focus',onOnline);
   refreshRef.current=null;
   runner.stop();
  };
 },[barberId]);
 const active=view.barberId===barberId ? view : {status:'loading',value:null};
 // Also reject responses that have aged while the screen was hidden.
 const summary=active.status==='ready' ? parsePublicQueueSummary(active.value,barberId) : null;
 const failed=active.status==='error' || (active.status==='ready'&&!summary);
 return <aside className="bpv-notice" aria-label={tr("Jonli walk-in navbat")}>
  <strong>{tr("Jonli walk-in navbat")}</strong>
  {summary?<p>{summary.day_closed?<>{tr("Bugungi ish kuni yopilgan. Yangi walk-in navbat qabul qilinmaydi.")}</>:<>{tr("Hozir kutayotganlar:")} <b>{summary.waiting_count}</b>
   {summary.currently_called?` · ${tr("Bir mijoz chaqirilgan")}`:''}
   {formatWait(summary.new_arrival_estimate)
    ? <> · {tr("Yangi keluvchi uchun:")} {localizeQueueWait(formatWait(summary.new_arrival_estimate),lang)}</>
    :<> · {tr("Kutish vaqti hozir aniq baholanmaydi")}</>}</>}</p>
   :failed?<p role="status">{tr("Jonli navbat ma’lumoti vaqtincha mavjud emas.")} <button type="button" className="bpv-retry" onClick={()=>{setView({barberId,status:'loading',value:null});void refreshRef.current?.();}}>{tr("Qayta urinish")}</button></p>
    :<p className="bx-muted">{tr("Navbat ma’lumoti yuklanmoqda…")}</p>}
  <small className="bx-muted">{tr("Bu bron vaqti emas. Taxminiy kutish oldindan tasdiqlangan bronlarni to‘liq hisobga olmaydi; sahifa ochiq turganda 30 soniyada yangilanadi.")}</small>
 </aside>;
}
