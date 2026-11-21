import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { request } from '../api/client';
import ProfileIssuesAdmin from './ProfileIssuesAdmin';
import AdminBadgePanelV162 from './AdminBadgePanelV162';
import AdminBookingControlV164 from './AdminBookingControlV164';
import AdminSuspensionCasesV188 from './AdminSuspensionCasesV188';
import AdminOpsReadOnlyV165 from './AdminOpsReadOnlyV165';
import {checkedAdminBadgePageV162} from './adminBadgeModelV162.js';
import {accountImpactUrlV186,validateAccountImpactV186,accountImpactTextV186} from './adminAccountImpactV186.js';
import {suspensionUrlV187,validSuspensionResultV187,suspensionLocaleV187} from './adminSuspensionV187.js';
import { ADMIN_LANGUAGES, adminLocaleParams, getAdminUi, readAdminLocale } from './adminLanguage.js';
import { getAdminOperations, adminStatusLabel, adminRoleLabel, adminTableHeaders } from './adminOperationsLocale.js';
import {profileReportsEndpoint,confirmedProfileReview,PROFILE_REPORT_MAX_PAGE,isProfileReportPage,visibleProfileReports,hasMoreProfileReports} from './profileIssueQueueModel.js';
import {getSmartBookingAdminLocale,isValidSmartBookingAdminState} from './smartBookingAdminLocaleV159.js';
import './AdminPanel.css';

const KEY='ustara-admin-access';
const sections=[['overview','Umumiy'],['users','Foydalanuvchilar'],['barbers','Sartaroshlar'],['bookings','Bronlar'],['suspension-cases','Suspend bronlar'],['reports','Shikoyatlar'],['profile-reports','Profil xatolari'],['recovery','Tiklash'],['telegram','Telegram'],['system','System Control'],['queue-settings','QR va navbat'],['smart-settings','Smart Booking'],['promotions','Reklama'],['badges','Badge tekshiruvlari']];
const nameOf = (item, prefix='') => [item[`${prefix}first_name`],item[`${prefix}last_name`]].filter(Boolean).join(' ');
const date = (value, lang) => value ? new Date(value).toLocaleString(({uz:'uz-UZ',ru:'ru-RU',en:'en-GB'})[lang]||'uz-UZ',{timeZone:'Asia/Tashkent'}) : '—';
export default function AdminPanel() {
  const [params,setParams]=useSearchParams();
  const lang=readAdminLocale(params);
  const ui=getAdminUi(lang);
  const ops=getAdminOperations(lang);
  const smartUi=getSmartBookingAdminLocale(lang);
  const languagePicker=<div className="admin-language"><label htmlFor="admin-language">{ui.language}</label><select id="admin-language" aria-label={ui.language} value={lang} onChange={e=>setParams(adminLocaleParams(e.target.value),{replace:true})}>{ADMIN_LANGUAGES.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></div>;
  const [token,setToken]=useState(()=>sessionStorage.getItem(KEY)||'');
  const [login,setLogin]=useState(''); const [password,setPassword]=useState('');
  const [tab,setTab]=useState('overview'); const [data,setData]=useState(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [search,setSearch]=useState('');
  const submitting=useRef(false);
  const [retryUntil,setRetryUntil]=useState(0);
  const [profileIssueFilter,setProfileIssueFilter]=useState('pending');
  const [profileIssuePage,setProfileIssuePage]=useState(1);
  const activeView=useRef(null);
  activeView.current={tab,profileIssueFilter,profileIssuePage,token};
  const loadState=useRef({sequence:0,controller:null});
  const reviewInFlight=useRef(false);
  const discardLoad=useCallback(()=>{
    loadState.current.sequence++;
    loadState.current.controller?.abort();
    loadState.current.controller=null;
  },[]);
  const [promoHours,setPromoHours]=useState(24);
  const [qrMinutes,setQrMinutes]=useState('10');
  const [badgePage,setBadgePage]=useState(1);
  const [bookingRefresh,setBookingRefresh]=useState(0);
  const [operationsRefresh,setOperationsRefresh]=useState(0);
  const [now,setNow]=useState(Date.now);
  const remaining=Math.max(0,Math.ceil((retryUntil-now)/1000));
  useEffect(()=>{
    if(!retryUntil)return;
    const timer=setInterval(()=>{const time=Date.now();setNow(time);if(time>=retryUntil)setRetryUntil(0);},1000);
    return ()=>clearInterval(timer);
  },[retryUntil]);
  const logout=useCallback(()=>{discardLoad();sessionStorage.removeItem(KEY);setToken('');setData(null);setPassword('');setError('');setBusy(false);},[discardLoad]);
  const load=useCallback(async()=>{
    if(!token||['bookings','suspension-cases'].includes(tab))return;
    if(tab==='system'){setBusy(false);return;}
    const sequence=++loadState.current.sequence;
    loadState.current.controller?.abort();
    const controller=new AbortController();
    loadState.current.controller=controller;
    setBusy(true);setError('');
    const current=()=>!controller.signal.aborted && loadState.current.sequence===sequence
      && sessionStorage.getItem(KEY)===token && activeView.current.token===token
      && activeView.current.tab===tab
      && activeView.current.profileIssueFilter===profileIssueFilter
      && activeView.current.profileIssuePage===profileIssuePage;
    const endpoint=tab==='badges'?`badges?page=${badgePage}`:tab==='telegram'?'telegram/health':tab==='recovery'?'account-recovery/cases'
      :tab==='queue-settings'?'queue/qr-settings':tab==='smart-settings'?'smart-booking/rules':tab==='profile-reports'
      ?profileReportsEndpoint(profileIssueFilter,profileIssuePage):tab;
    try {
      if (!endpoint) throw new Error('Profil xatolari filtri noto‘g‘ri.');
      const result=await request('GET',`/api/admin/${endpoint}`,{token,signal:controller.signal});
      if(!current())return;
      if (tab==='profile-reports' && !isProfileReportPage(result)) throw new Error('Profil xatolari javobi noto‘g‘ri.');
      if(tab==='badges' && !checkedAdminBadgePageV162(result))throw new Error('Badge javobi noto‘g‘ri.');
      setData(result);
      if(tab==='queue-settings')setQrMinutes(String(result.ttl_minutes));
    } catch(e) {
      if(!current())return;
      if(e.status===401 || e.status===403) logout();
      else {setError(e.message);setData(null);}
    } finally {
      if(loadState.current.sequence===sequence) {
        loadState.current.controller=null;
        setBusy(false);
      }
    }
  },[token,tab,profileIssueFilter,profileIssuePage,badgePage,logout]);
  useEffect(()=>{const timer=setTimeout(()=>{void load();},0);
    return ()=>{clearTimeout(timer);discardLoad();};},[load,discardLoad]);
  const signIn=async(e)=>{e.preventDefault();if(submitting.current||retryUntil>Date.now())return;submitting.current=true;setBusy(true);setError('');try {
    const result=await request('POST','/api/admin/login',{body:{login,password}});
    if (!result?.token) throw new Error('Server token qaytarmadi');
    sessionStorage.setItem(KEY,result.token);setToken(result.token);setPassword('');
  }catch(e){
    const seconds=e.metadata?.retryAfter;
    if(e.status===429&&Number.isFinite(seconds)&&seconds>0){const time=Date.now();setNow(time);setRetryUntil(time+Math.ceil(seconds)*1000);setError('Urinishlar ko‘payib ketdi.');}
    else setError(e.message);
  }finally{submitting.current=false;setBusy(false);}};
  const verify=async(id,status)=>{
    if (!window.confirm(ops.verifyQuestion(id,status)))return;
    setBusy(true);setError('');try{await request('PATCH',`/api/barbers/${id}/verify`,{token,body:{status}});await load();}catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const changeSuspension=async(user)=>{
    if(busy || tab!=='users')return;
    const id=Number(user.profile_id),url=suspensionUrlV187(user.role,id);
    const labels=suspensionLocaleV187[lang]||suspensionLocaleV187.uz;
    if(!url||typeof user.is_suspended!=='boolean'){setError(labels.unavailable);return;}
    const action=user.is_suspended?'restore':'suspend';
    const originalToken=token;
    const sameView=()=>sessionStorage.getItem(KEY)===originalToken&&activeView.current.tab==='users';
    setBusy(true);setError('');
    try {
      if(action==='suspend'){
        const impact=await request('GET',accountImpactUrlV186(user.role,id),{token:originalToken});
        if(!sameView())return;
        if(!validateAccountImpactV186(impact,user.role,id))throw Error(labels.unavailable);
        if(!window.confirm(labels.warning(impact.activeCount)))return;
      }else if(!window.confirm(labels.restoreWarning))return;
      if(!sameView())return;
      const reason=window.prompt(labels.reason);
      if(reason===null||!sameView())return;
      const trimmed=reason.trim();
      if(trimmed.length<5||trimmed.length>300){setError(labels.reason);return;}
      const result=await request('PATCH',url,{token:originalToken,
        body:{action,reason:trimmed,expectedSuspended:user.is_suspended}});
      if(!sameView())return;
      if(!validSuspensionResultV187(result,user.role,id,action))throw Error(labels.unavailable);
      await load();
    }catch(e){if(sameView())setError(e.message||labels.unavailable);}
    finally{if(sameView())setBusy(false);}
  };
  const deleteAccount=async(user)=>{
    if(busy||tab!=='users')return;
    const originalToken=token;
    const impactUrl=accountImpactUrlV186(user.role,Number(user.profile_id));
    const labels=accountImpactTextV186[lang]||accountImpactTextV186.uz;
    if(!impactUrl){setError(labels.unavailable);return;}
    setBusy(true);setError('');
    const sameAccount=()=>sessionStorage.getItem(KEY)===originalToken&&activeView.current.tab==='users';
    try {
      // No destructive confirmation until server returns a valid, current preview.
      const impact=await request('GET',impactUrl,{token:originalToken});
      if(!sameAccount())return;
      if(!validateAccountImpactV186(impact,user.role,Number(user.profile_id)))throw Error(labels.unavailable);
      if(impact.activeCount>0){setError(labels.blocked(impact.activeCount));return;}
      if(!window.confirm(labels.confirm))return;
      const typed=window.prompt(ops.deleteAccountQuestion(nameOf(user)||user.phone,user.phone));
      if(typed!==user.phone||!sameAccount())return;
      await request('DELETE',`/api/admin/users/${user.role}/${user.profile_id}`,{token:originalToken});
      if(sameAccount())await load();
    }catch(e){if(sameAccount())setError(e.message||labels.unavailable);}
    finally{if(sameAccount())setBusy(false);}
  };
  const promote=async(id,enabled)=>{
    if(!window.confirm(ops.promoteQuestion(id,promoHours,enabled)))return;
    setBusy(true);setError('');
    try {await request(enabled?'DELETE':'PUT',`/api/admin/promotions/${id}`,{token,...(enabled?{}:{body:{hours:Number(promoHours)}})});await load();}
    catch(e){setError(e.message||ops.errors.promotions);}finally{setBusy(false);}
  };
  const saveQrMinutes=async(e)=>{
    e.preventDefault();
    const minutes=Number(qrMinutes);
    if(!Number.isInteger(minutes)||minutes<1||minutes>120){setError(ops.errors.qrRange);return;}
    setBusy(true);setError('');try{
      const updated=await request('PUT','/api/admin/queue/qr-settings',{token,body:{ttl_minutes:minutes}});
      setData(updated);setQrMinutes(String(updated.ttl_minutes));
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const toggleSmartBooking=async()=>{
    if(busy||tab!=='smart-settings'||!isValidSmartBookingAdminState(data))return;
    const nextEnabled=!data.enabled;
    if(!window.confirm(nextEnabled?smartUi.confirmResume:smartUi.confirmPause))return;
    const previousToken=token;
    setBusy(true);setError('');
    try{
      const updated=await request('PUT','/api/admin/smart-booking/rules',{
        token:previousToken,body:{enabled:nextEnabled,expected_revision:Number(data.revision)}});
      if(sessionStorage.getItem(KEY)!==previousToken||activeView.current.tab!=='smart-settings')return;
      if(!isValidSmartBookingAdminState(updated)||updated.enabled!==nextEnabled)
        throw new Error(smartUi.unknown);
      setData(updated);
    }catch(e){
      if(sessionStorage.getItem(KEY)!==previousToken||activeView.current.tab!=='smart-settings')return;
      // Lost COMMIT response is ambiguous. Refresh; do not repeat PUT automatically.
      await load();
      setError((e?.message||smartUi.unknown)+' '+smartUi.unknown);
    }finally{if(sessionStorage.getItem(KEY)===previousToken && activeView.current.tab==='smart-settings')setBusy(false);}
  };
  const changeBadge=async(barberId,type,action,expectedRevision,question)=>{
    if(busy||!Number.isSafeInteger(expectedRevision)||!['grant','revoke'].includes(action))return;
    const note=window.prompt(question);
    if(!note||note.trim().length<20||note.trim().length>500)return;
    if(!window.confirm(`${barberId}: ${type} — ${action}?`))return;
    const originalToken=token;setBusy(true);setError('');
    const stillHere=()=>sessionStorage.getItem(KEY)===originalToken&&activeView.current.tab==='badges';
    try{
      const answer=await request('PUT',`/api/admin/badges/${barberId}/${type}`,{
        token:originalToken,body:{action,evidence_note:note.trim(),expected_revision:expectedRevision}});
      if(!stillHere())return;
      // Lost ACK can mean COMMIT succeeded. Never repeat automatically.
      if(answer?.barberId!==barberId||answer.type!==type||answer.revision!==expectedRevision+1)
        throw Error('Badge natijasi noma’lum. Yangilang.');
      await load();
    }catch(e){if(stillHere()){await load();setError((e?.message||'Badge o‘zgartirilmadi.')+' Yangilangan holatni tekshiring.');}}
    finally{if(stillHere())setBusy(false);}
  };
  const reviewRecovery=async(entry,nextStatus)=>{
    if(busy)return;
    const reason=window.prompt(ops.reviewRecoveryQuestion(entry.id.slice(0,8),adminStatusLabel(nextStatus,lang)));
    if(!reason||reason.trim().length<3)return;
    setBusy(true);setError('');
    try{await request('POST',`/api/admin/account-recovery/${entry.id}/review`,{token,body:{status:nextStatus,reason:reason.trim()}});await load();}
    catch(e){setError(e.message||ops.errors.recovery);}
    finally{setBusy(false);}
  };
  const remove=async(postId)=>{
    if(!window.confirm(ops.removePostQuestion(postId)))return;
    setBusy(true);setError('');try{await request('DELETE',`/api/admin/posts/${postId}`,{token});await load();}catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const reviewProfileIssue = async(id,status)=>{
    if(busy || reviewInFlight.current || !['resolved','dismissed'].includes(status)
      || !Number.isSafeInteger(Number(id)) || Number(id)<1
      || !window.confirm(ops.profileReviewQuestion(id,status))) return;
    reviewInFlight.current=true;setBusy(true);setError('');
    const reviewToken=token;
    const sameReviewView=()=>sessionStorage.getItem(KEY)===reviewToken
      && activeView.current.tab===tab && activeView.current.profileIssueFilter===profileIssueFilter
      && activeView.current.profileIssuePage===profileIssuePage;
    try {
      const result=await request('PATCH',`/api/admin/profile-reports/${id}`,{token:reviewToken,body:{status}});
      if(sessionStorage.getItem(KEY)!==reviewToken)return;
      if(!confirmedProfileReview(result,id,status))
        throw new Error(ops.errors.profileUnknown);
      if(sameReviewView()) await load();
    } catch(e) {
      if(!sameReviewView())return;
      // A timeout can occur after COMMIT: refresh first, never automatically repeat the mutation.
      await load();
      if(sameReviewView())
        setError((e?.message||ops.errors.profileUnconfirmed)+' '+ops.errors.profileRefresh);
    } finally {reviewInFlight.current=false;if(sameReviewView())setBusy(false);}
  };
  if (!token) return <main className="admin-login"><div className="admin-sign">{languagePicker}<div className="admin-logo">U<span>✦</span>STARA <small>CONTROL</small></div><h1>{ui.loginTitle}</h1><p>{ui.loginIntro}</p><form onSubmit={signIn}><label>{ui.login}<input autoComplete="username" required value={login} onChange={e=>setLogin(e.target.value)}/></label><label>{ui.password}<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy||remaining>0}>{busy?ui.signingIn:ui.signIn}</button></form>{error&&<p className="admin-error" role="alert">{error}</p>}{remaining>0&&<p role="status">{ui.retryPrefix} {Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')} {ui.retrySuffix}</p>}<Link to="/">← {ui.back}</Link></div></main>;
  const sourceRows=Array.isArray(data)?data:tab==='recovery'&&Array.isArray(data?.cases)?data.cases:[];
  const records=(tab==='profile-reports' ? visibleProfileReports(sourceRows) : sourceRows)
    .filter(r=>JSON.stringify(r).toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <div className="admin-shell"><aside className="admin-side"><div className="admin-brand">USTARA <small>ADMIN</small></div>{languagePicker}<nav aria-label={ui.control}>{sections.map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>{discardLoad();setTab(id);setData(null);setSearch('');}}>{ui.sections[id]}</button>)}</nav><Link to="/">{ui.back} ↗</Link><button className="admin-exit" onClick={logout}>{ui.exit}</button></aside><main className="admin-main"><header className="admin-header"><div><p>{ui.control}</p><h1>{ui.sections[tab]}</h1></div><button onClick={['bookings','suspension-cases'].includes(tab)?()=>setBookingRefresh(v=>v+1):['system','telegram'].includes(tab)?()=>{setOperationsRefresh(v=>v+1);if(tab==='telegram')void load();}:load} disabled={busy}>{ui.refresh}</button></header>{error&&<p className="admin-error" role="alert">{error}</p>}{busy&&<p role="status">{ui.loading}</p>}{tab==='overview'&&data&&<div className="admin-stats">{[[ui.overview.customers,data.users?.customer],[ui.overview.barbers,data.users?.barber],[ui.overview.pendingBarbers,data.barbers?.pending],[ui.overview.approvedBarbers,data.barbers?.approved],[ui.overview.pendingBookings,data.bookings?.pending],[ui.overview.completedBookings,data.bookings?.completed],[ui.overview.posts,data.posts],[ui.overview.reports,data.reports]].map(([title,count])=><article key={title}><span>{title}</span><strong>{count??0}</strong></article>)}</div>}{tab==='bookings'&&<AdminBookingControlV164 token={token} lang={lang} refreshKey={bookingRefresh} onUnauthorized={logout}/>}
    {tab==='suspension-cases'&&<AdminSuspensionCasesV188 token={token} lang={lang} refreshKey={bookingRefresh} onUnauthorized={logout}/>}
    {tab==='badges' && data && <AdminBadgePanelV162 data={data} lang={lang} busy={busy} onChange={changeBadge} onPage={page=>{if(page>=1&&page<=100){setBadgePage(page);setData(null);}}}/>}{tab==='profile-reports' && Array.isArray(data) && <ProfileIssuesAdmin records={records} busy={busy} onReview={reviewProfileIssue}
    statusFilter={profileIssueFilter} page={profileIssuePage} hasNext={hasMoreProfileReports(data)} lang={lang}
    onFilterChange={status=>{setProfileIssueFilter(status);setProfileIssuePage(1);setData(null);}}
    onPageChange={page=>{if(!Number.isInteger(page)||page<1||page>PROFILE_REPORT_MAX_PAGE)return;setProfileIssuePage(page);setData(null);}}/>}{['users','barbers','reports','recovery'].includes(tab)&&<><input className="admin-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={ui.listSearch} aria-label={ui.listSearch}/><div className="admin-table-wrap"><table><thead><tr>{adminTableHeaders(tab,lang).map((title,index)=><th key={index}>{title}</th>)}</tr></thead><tbody>{records.map(r=><tr key={r.id}>{tab==='users'?<><td><b>{nameOf(r)||ops.missingName}</b><small>#{r.user_id}</small></td><td>{r.phone}</td><td>{adminRoleLabel(r.role,lang)}</td><td>{date(r.created_at,lang)}</td><td><div className='admin-actions'><span className={`admin-pill ${r.is_suspended?'rejected':'approved'}`}>{r.is_suspended?suspensionLocaleV187[lang].suspended:r.is_deactivated?suspensionLocaleV187[lang].deactivated:suspensionLocaleV187[lang].active}</span><button type='button' disabled={busy||!r.profile_id||typeof r.is_suspended!=='boolean'} onClick={()=>changeSuspension(r)}>{r.is_suspended?suspensionLocaleV187[lang].restore:suspensionLocaleV187[lang].suspend}</button><button type='button' className='admin-danger' disabled={busy||!r.profile_id} onClick={()=>deleteAccount(r)}>{ops.actions.delete}</button></div></td></>:tab==='barbers'?<><td><b>{nameOf(r)}</b><small> #{r.id} · {r.salon_name||ops.missingSalon}</small></td><td>{r.phone}</td><td>{r.specialty}</td><td><span className={`admin-pill ${r.verification_status}`}>{adminStatusLabel(r.verification_status,lang)}</span></td><td><div className="admin-actions"><button disabled={busy||r.verification_status==='approved'} onClick={()=>verify(r.id,'approved')}>{ops.actions.approve}</button><button disabled={busy||r.verification_status==='rejected'} className="secondary" onClick={()=>verify(r.id,'rejected')}>{ops.actions.reject}</button></div></td></>:tab==='bookings'?<><td>#{r.id}</td><td>{nameOf(r,'customer_')}</td><td>{nameOf(r,'barber_')}</td><td>{r.service_name}</td><td>{date(r.booking_time,lang)}</td><td><span className="admin-pill">{adminStatusLabel(r.status,lang)}</span></td></>:tab==='recovery'?<><td>{r.id.slice(0,8)}…</td><td>{r.phone}</td><td>{adminStatusLabel(r.status,lang)}</td><td>{date(r.created_at,lang)}</td><td><div className="admin-actions"><button disabled={busy||r.status==='closed'} onClick={()=>reviewRecovery(r,'reviewing')}>{ops.actions.review}</button><button disabled={busy||r.status==='closed'} onClick={()=>reviewRecovery(r,'verification_needed')}>{ops.actions.needsVerification}</button><button disabled={busy||r.status==='closed'} onClick={()=>reviewRecovery(r,'closed')}>{ops.actions.close}</button></div></td></>:<><td>#{r.post_id}</td><td>{nameOf(r,'barber_')}</td><td>{r.reason}</td><td>{r.details||'—'}</td><td>{date(r.created_at,lang)}</td><td><button className="admin-danger" onClick={()=>remove(r.post_id)} disabled={busy}>{ops.actions.deletePost}</button></td></>}</tr>)}</tbody></table>{data&&records.length===0&&<p className="admin-empty">{ui.empty}</p>}</div><p className="admin-hint">{ops.listHint}</p></>}{tab==='promotions'&&Array.isArray(data)&&<div className="admin-promo"><p>{ops.promotion.description}</p><label>{ops.promotion.hours}<input type="number" min="1" max="720" value={promoHours} onChange={e=>setPromoHours(e.target.value)}/></label><div className="admin-table-wrap"><table><thead><tr>{adminTableHeaders('promotions',lang).map((title,index)=><th key={index}>{title}</th>)}</tr></thead><tbody>{data.map(b => {const active=b.is_active && new Date(b.expires_at)>new Date() && new Date(b.starts_at)<=new Date();return <tr key={b.id}><td>{nameOf(b)} (#{b.id})</td><td>{active?ops.promotion.active:adminStatusLabel(b.verification_status,lang)}</td><td>{b.expires_at?date(b.expires_at,lang):'—'}</td><td><button disabled={busy||b.verification_status!=='approved'} onClick={()=>promote(b.id,active)}>{active?ops.actions.stop:ops.actions.promote}</button></td></tr>;})}</tbody></table></div></div>}{tab==='queue-settings'&&data&&<section className="admin-tg">
    <h2>{ops.qr.title}</h2>
    <p>{ops.qr.description}</p>
    <form onSubmit={saveQrMinutes}><label>{ops.qr.duration}
      <input type="number" min="1" max="120" step="1" required value={qrMinutes} onChange={e=>setQrMinutes(e.target.value)} disabled={busy}/>
    </label> <button type="submit" disabled={busy}>{ops.actions.save}</button></form>
    <p>{ops.qr.current}: <strong>{data.ttl_minutes} {ops.qr.minute}</strong></p>
  </section>}{tab==='smart-settings'&&data&&<section className="admin-tg" aria-live="polite">
    <h2>{smartUi.title}</h2><p>{smartUi.description}</p>
    {isValidSmartBookingAdminState(data)?<>
      <p><strong>{data.enabled?smartUi.active:smartUi.paused}</strong> · {smartUi.revision}: {data.revision}</p>
      <button type="button" disabled={busy} onClick={toggleSmartBooking}>{data.enabled?smartUi.pause:smartUi.resume}</button>
    </>:<p className="admin-error" role="alert">{smartUi.unknown}</p>}
  </section>}{tab==='system'&&<AdminOpsReadOnlyV165 token={token} lang={lang} kind="system" refreshKey={operationsRefresh} onUnauthorized={logout}/>}
    {tab==='telegram'&&<AdminOpsReadOnlyV165 token={token} lang={lang} kind="telegram" refreshKey={operationsRefresh} onUnauthorized={logout}/>}
    {tab==='telegram'&&data&&<div className="admin-tg"><h2>{ops.telegram.title}</h2>{[[ops.telegram.mode,data.mode],[ops.telegram.configured,data.configured?ops.telegram.yes:ops.telegram.no],[ops.telegram.api,data.apiReachable?ops.telegram.reachable:ops.telegram.no],[ops.telegram.identity,data.identityMatches?ops.telegram.match:ops.telegram.mismatch],[ops.telegram.webhook,data.webhookActive?ops.telegram.present:ops.telegram.no],[ops.telegram.linked,data.linkedBarbers??ops.telegram.unknown]].map(([k,v])=><div key={k}><span>{k}</span><b>{v}</b></div>)}{data.modeConflict&&<p className="admin-error">{ops.telegram.conflict}</p>}<p>{ops.telegram.hint}</p></div>}</main></div>;
}
