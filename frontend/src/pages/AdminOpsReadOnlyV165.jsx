import {useEffect,useState} from 'react';
import {request} from '../api/client.js';
import {opsReadOnlyLocaleV165,validateOpsReadOnlyV165} from './adminOpsReadOnlyV165.js';

// Rendered only inside authenticated Admin. Navigation/refresh never retries an action.
export default function AdminOpsReadOnlyV165({token,lang='uz',kind='system',refreshKey=0,onUnauthorized}){
 const [state,setState]=useState({data:null,error:'',busy:true});
 const labels=opsReadOnlyLocaleV165[lang]||opsReadOnlyLocaleV165.uz;
 useEffect(()=>{
  const controller=new AbortController();let active=true;
  setState({data:null,error:'',busy:true});
  const endpoint=kind==='telegram'?'/api/admin/telegram/outbox':'/api/admin/system/readiness';
  (async()=>{
   try{
    const payload=await request('GET',endpoint,{token,signal:controller.signal});
    if(!validateOpsReadOnlyV165(payload,kind))throw Error(labels.unknown);
    if(active)setState({data:payload,error:'',busy:false});
   }catch(err){
    if(!active)return;
    if(err.status===401||err.status===403){onUnauthorized?.();return;}
    setState({data:null,error:err.status===404?labels.disabled:labels.unknown,busy:false});
   }
  })();
  return ()=>{active=false;controller.abort();};
 },[token,kind,refreshKey,onUnauthorized,labels]);
 const data=state.data;
 return <section className="admin-ops-v165" aria-live="polite">
  <h2>{kind==='telegram'?labels.outbox:labels.system}</h2>
  <p>{labels.intro}</p>
  {state.busy&&<p role="status">…</p>}
  {state.error&&<p role="alert" className="admin-error">{state.error}</p>}
  {data&&<>
   <p><strong>{data.status==='attention'?labels.attention:labels.ok}</strong></p>
   <p>{labels.checked}: <time dateTime={data.checkedAt}>{new Date(data.checkedAt).toLocaleString(({uz:'uz-UZ',ru:'ru-RU',en:'en-GB'})[lang]||'uz-UZ',{timeZone:'Asia/Tashkent'})}</time></p>
   {kind==='system'&&<p>{labels.database}: {labels.reachable}</p>}
   {kind==='telegram'&&<div className="admin-ops-tables">{['queue','smart_booking'].map(channel=><div key={channel}>
    <h3>{labels[channel]}</h3>
    <table><thead><tr><th>{labels.status}</th><th>{labels.count}</th><th>{labels.due}</th><th>{labels.stale}</th></tr></thead><tbody>
    {Object.entries(data.telegramDelivery.summary[channel]).map(([status,info])=><tr key={status}><td>{labels[status]}</td><td>{info.total}</td><td>{info.overdue_pending}</td><td>{info.stale_lease}</td></tr>)}
    </tbody></table>
   </div>)}</div>}
   <h3>{labels.alerts} ({data.telegramDelivery.alerts.length})</h3>
   {data.telegramDelivery.alerts.length===0?<p>{labels.empty}</p>:<ul>{data.telegramDelivery.alerts.map((item,i)=><li key={`${item.channel}-${item.status}-${i}`}>{labels[item.channel]} · {labels[item.status]}: {item.count} ({labels.due}: {item.overdue_pending}, {labels.stale}: {item.stale_lease})</li>)}</ul>}
   <p><small>{labels.notVerified}</small></p>
  </>}
 </section>;
}
