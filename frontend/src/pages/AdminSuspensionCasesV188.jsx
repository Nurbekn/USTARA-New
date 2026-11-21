import {useEffect,useRef,useState} from 'react';
import {request} from '../api/client';
import {CASE_FILTERS_V188,CASE_CHANNELS_V188,suspensionCasesUrlV188,suspensionCaseActionUrlV188,
 validCasePageV188,validCaseMutationV188,suspensionCasesLocaleV188} from './adminSuspensionCasesV188.js';
import {noticeRequestUrlV189,noticeRequestOkV189,canRequestTelegramV189,noticeLocaleV189} from './suspensionTelegramNoticesV189.js';

const displayDate=(value,lang)=>value?new Date(value).toLocaleString(({uz:'uz-UZ',ru:'ru-RU',en:'en-GB'})[lang]||'uz-UZ',{timeZone:'Asia/Tashkent'}):'—';
export default function AdminSuspensionCasesV188({token,lang='uz',refreshKey=0,onUnauthorized}){
 const t=suspensionCasesLocaleV188[lang]||suspensionCasesLocaleV188.uz;
 const nt=noticeLocaleV189[lang]||noticeLocaleV189.uz;
 const [status,setStatus]=useState('open'),[page,setPage]=useState(1);
 const [result,setResult]=useState(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[channel,setChannel]=useState('phone'),[reload,setReload]=useState(0);
 const tokenRef=useRef(token);tokenRef.current=token;
 const active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{
  const url=suspensionCasesUrlV188(status,page);
  const controller=new AbortController();let live=true;
  setResult(null);setError('');setLoading(true);
  if(!url){setError(t.unknown);setLoading(false);return()=>{live=false;controller.abort();};}
  request('GET',url,{token,signal:controller.signal}).then(value=>{
   if(!live||tokenRef.current!==token)return;
   if(!validCasePageV188(value,status,page))throw Error(t.unknown);
   setResult(value);
  }).catch(e=>{
   if(!live||tokenRef.current!==token)return;
   setError(e?.message||t.unknown);
   if(e.status===401||e.status===403)onUnauthorized?.();
  }).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;controller.abort();};
 },[token,status,page,refreshKey,reload,onUnauthorized]);
 const requestNotice=async record=>{
  if(busy||!canRequestTelegramV189(record))return;
  const url=noticeRequestUrlV189(record.id);
  if(!url||!window.confirm(nt.confirm))return;
  const originalToken=token;setBusy(true);setError('');
  try{
   const value=await request('POST',url,{token:originalToken,body:{expectedRevision:record.revision}});
   if(!active.current||tokenRef.current!==originalToken)return;
   if(!noticeRequestOkV189(value,record.id))throw Error(t.unknown);
   setReload(n=>n+1);
  }catch(e){
   if(!active.current||tokenRef.current!==originalToken)return;
   setError(e.status===503?t.unknown:(e?.message||t.unknown));
   // Never retry after uncertain HTTP result; refresh before any further action.
   setReload(n=>n+1);
   if(e.status===401||e.status===403)onUnauthorized?.();
  }finally{if(active.current&&tokenRef.current===originalToken)setBusy(false);}
 };
 const act=async(record,action)=>{
  if(busy)return;
  const url=suspensionCaseActionUrlV188(record.id);
  if(!url||!window.confirm(t.confirm))return;
  const originalToken=token;
  setBusy(true);setError('');
  try{
   const value=await request('PATCH',url,{token:originalToken,body:{action,expectedRevision:record.revision,
    ...(action==='attempt'?{channel}:{})}});
   if(!active.current||tokenRef.current!==originalToken)return;
   if(!validCaseMutationV188(value,record.id,action,record.revision))throw Error(t.unknown);
   setReload(n=>n+1);
  }catch(e){
   if(!active.current||tokenRef.current!==originalToken)return;
   setError(e.status===503? t.unknown:(e.message||t.unknown));
   // The server may have committed. Do not automatically retry a PATCH.
   if(e.status===401||e.status===403)onUnauthorized?.();
  }finally{if(active.current&&tokenRef.current===originalToken)setBusy(false);}
 };
 return <section className="admin-suspension-cases-v188" aria-label={t.intro}>
  <p className="admin-hint">{t.intro}</p>
  <div className="admin-suspension-filters">
   <label>{t.status}<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}>{CASE_FILTERS_V188.map(k=><option key={k} value={k}>{t[k]}</option>)}</select></label>
   <label>{t.channel}<select value={channel} onChange={e=>setChannel(e.target.value)}>{CASE_CHANNELS_V188.map(k=><option key={k} value={k}>{t[k]}</option>)}</select></label>
   <button type="button" onClick={()=>setReload(n=>n+1)} disabled={loading||busy}>{t.refresh}</button>
  </div>
  {error&&<p role="alert" className="admin-error">{error}</p>}
  {loading&&<p role="status">{t.loading}</p>}
  {result&&<>
   <div className="admin-table-wrap"><table><thead><tr>{[t.book,t.when,t.bookingStatus,t.contact,t.caseStatus,nt.title,t.action].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
    {result.rows.map(c=><tr key={c.id}><td>#{c.booking_id||'—'}</td><td>{displayDate(c.booking_time,lang)}</td>
     <td>{c.booking_status||'—'}</td><td>{c.contact_role?t[c.contact_role]:'—'}</td><td>{t[c.case_status]}</td>
     <td>{c.telegram_notice_status?(nt[c.telegram_notice_status]||'—'):(c.contact_role==='customer'?nt.unavailable:'—')}</td>
     <td><div className="admin-actions">
      {canRequestTelegramV189(c)&&<button type="button" disabled={busy} onClick={()=>requestNotice(c)}>{nt.request}</button>}
      {c.case_status==='pending'&&<button type="button" disabled={busy} onClick={()=>act(c,'review')}>{t.review}</button>}
      {['reviewed','attempted'].includes(c.case_status)&&<>
       <button type="button" disabled={busy} onClick={()=>act(c,'attempt')}>{t.attempt}</button>
       <button type="button" disabled={busy||(c.account_still_suspended===true&&['pending','confirmed'].includes(c.booking_status))} onClick={()=>act(c,'close')}>{t.close}</button>
      </>}
     </div></td></tr>)}
   </tbody></table>{!result.rows.length&&<p className="admin-empty">{t.none}</p>}</div>
   <nav className="admin-suspension-pages" aria-label={t.page}>
    <button type="button" onClick={()=>setPage(n=>n-1)} disabled={page===1||loading||busy}>{t.prev}</button>
    <span>{t.page} {page}</span>
    <button type="button" onClick={()=>setPage(n=>n+1)} disabled={!result.hasMore||page>=100||loading||busy}>{t.next}</button>
   </nav>
   <p className="admin-hint">{t.note} {nt.note}</p>
  </>}
 </section>;
}
