import {useEffect,useState} from 'react';
import {request} from '../api/client';
import {bookingControlEndpointV164,validBookingControlResponseV164,bookingLocaleV164,STATUSES_V164} from './adminBookingControlV164.js';
import {adminTableHeaders} from './adminOperationsLocale.js';
import './AdminBookingControlV164.css';
const displayDate=(value,lang)=>value?new Date(value).toLocaleString(({uz:'uz-UZ',ru:'ru-RU',en:'en-GB'})[lang]||'uz-UZ',{timeZone:'Asia/Tashkent'}):'—';
const fullName=(r,prefix)=>[r[`${prefix}first`],r[`${prefix}last`]].filter(Boolean).join(' ')||'—';
export default function AdminBookingControlV164({token,lang='uz',refreshKey=0,onUnauthorized}){
 const labels=bookingLocaleV164[lang]||bookingLocaleV164.uz;
 const [draft,setDraft]=useState({status:'all',date:'',barberId:''});
 const [filter,setFilter]=useState({status:'all',date:'',barberId:''});
 const [page,setPage]=useState(1);
 const [result,setResult]=useState(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 useEffect(()=>{
  const url=bookingControlEndpointV164({...filter,page});
  if(!url){setResult(null);setError(labels.invalid);return;}
  const controller=new AbortController();let active=true;
  setResult(null);setError('');setLoading(true);
  request('GET',url,{token,signal:controller.signal}).then(value=>{
   if(!active)return;
   if(!validBookingControlResponseV164(value,page))throw new Error(labels.response);
   setResult(value);
  }).catch(err=>{
   if(!active)return;
   setResult(null);setError(err.message||labels.response);
   if(err.status===401||err.status===403)onUnauthorized?.();
  }).finally(()=>{if(active)setLoading(false);});
  return ()=>{active=false;controller.abort();};
 },[token,filter,page,refreshKey,onUnauthorized]);
 const apply=e=>{
  e.preventDefault();
  if(!bookingControlEndpointV164({...draft,page:1})){setError(labels.invalid);return;}
  setPage(1);setFilter({...draft});
 };
 const headers=adminTableHeaders('bookings',lang);
 return <section className="admin-booking-control" aria-label={labels.intro}>
  <p className="admin-hint">{labels.intro}</p>
  <form onSubmit={apply} className="admin-booking-filters">
   <label>{labels.status}<select value={draft.status} onChange={e=>setDraft(d=>({...d,status:e.target.value}))}>{STATUSES_V164.map(status=><option key={status} value={status}>{status==='all'?labels.all:labels.statusNames[status]}</option>)}</select></label>
   <label>{labels.day}<input type="date" value={draft.date} onChange={e=>setDraft(d=>({...d,date:e.target.value}))}/></label>
   <label>{labels.barber}<input inputMode="numeric" pattern="[1-9][0-9]*" placeholder="ID" value={draft.barberId} onChange={e=>setDraft(d=>({...d,barberId:e.target.value}))}/></label>
   <button disabled={loading} type="submit">{labels.apply}</button>
  </form>
  {error&&<p className="admin-error" role="alert">{error}</p>}
  {loading&&<p role="status">{lang==='ru'?'Загрузка…':lang==='en'?'Loading…':'Yuklanmoqda…'}</p>}
  {result&&<>
   <div className="admin-table-wrap"><table><thead><tr>{headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>
    {result.bookings.map(r=><tr key={r.id}><td>#{r.id}</td><td>{fullName(r,'customer_')}</td><td>{fullName(r,'barber_')}<small>#{r.barber_id}</small></td><td>{r.service_name||'—'}</td><td>{displayDate(r.booking_time,lang)}</td><td><span className="admin-pill">{labels.statusNames[r.status]||r.status}</span></td></tr>)}
   </tbody></table>{!result.bookings.length&&<p className="admin-empty">{labels.none}</p>}</div>
   <nav className="admin-booking-pages" aria-label={labels.page}><button type="button" disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>{labels.prev}</button><span>{labels.page} {page}</span><button type="button" disabled={!result.hasNext||page>=100||loading} onClick={()=>setPage(p=>p+1)}>{labels.next}</button></nav>
   <p className="admin-hint">{labels.hint}</p>
  </>}
 </section>;
}
