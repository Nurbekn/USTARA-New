import {useEffect,useRef,useState} from 'react';
import {getSession,subscribeSession} from '../../auth/utils/session.js';
import {privateBookingNoteV182,normalizePrivateNote,validPrivateNote,
  PRIVATE_NOTE_LIMIT_V182,privateBookingNoteUiV182} from '../data/bookingPrivateNoteV182.js';
import './booking-private-note-v182.css';
// Lazy, barber-only note. Never show previously fetched text after account changes.
export default function BookingPrivateNoteV182({bookingId,lang='uz'}) {
  const ui=privateBookingNoteUiV182(lang);
  const [open,setOpen]=useState(false);
  const [saved,setSaved]=useState(null);
  const [draft,setDraft]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [needsReload,setNeedsReload]=useState(false);
  const requestRef=useRef(null);
  const epoch=useRef(0);
  const identity=useRef('');
  useEffect(()=>{
    const reset=()=>{
      const s=getSession(); const id=s?.role==='barber' ? `${s.accountId}:${s.profileId}:${s.token}` : '';
      if (id===identity.current) return;
      identity.current=id; epoch.current++; requestRef.current?.abort();
      setOpen(false);setSaved(null);setDraft('');setError('');setNotice('');setBusy(false);setNeedsReload(false);
    };
    const off=subscribeSession(reset);
    return ()=>{epoch.current++;requestRef.current?.abort();off();};
  },[]);
  useEffect(()=>()=>{epoch.current++;requestRef.current?.abort();},[bookingId]);
  const load=async()=>{
    requestRef.current?.abort();const controller=new AbortController();requestRef.current=controller;
    const current=++epoch.current;
    setBusy(true);setError('');setNotice('');setNeedsReload(true);setSaved(null);setDraft('');
    try{
      const result=await privateBookingNoteV182(bookingId,'GET',null,{signal:controller.signal});
      if (current!==epoch.current) return;
      setSaved(result);setDraft(result.text);setNeedsReload(false);
    } catch(e) {if(current===epoch.current) setError(e.message||ui.unknown);}
    finally {if(current===epoch.current) setBusy(false);}
  };
  const mutate=async(method)=>{
    if (busy||needsReload||!saved) return;
    const text=normalizePrivateNote(draft);
    if (method==='PUT' && !validPrivateNote(text)) {setError(`1–${PRIVATE_NOTE_LIMIT_V182}`);return;}
    const current=++epoch.current;
    setBusy(true);setError('');setNotice('');
    try {
      const result=await privateBookingNoteV182(bookingId,method,{expectedRevision:saved.revision,...(method==='PUT'?{text}: {})});
      if(current!==epoch.current) return;
      setSaved(result);setDraft(result.text);setNotice(method==='PUT'?ui.saved:ui.deleted);
    } catch(e) {
      if(current!==epoch.current) return;
      setNeedsReload(true);
      setSaved(null);setDraft('');
      setError(e.code==='note_changed'?ui.conflict:ui.unknown);
    } finally {if(current===epoch.current) setBusy(false);}
  };
  const close=()=>{epoch.current++;requestRef.current?.abort();setOpen(false);setSaved(null);setDraft('');setError('');setNotice('');setNeedsReload(false);setBusy(false);};
  return <div className="bx-private-note-v182">
    {!open ? <button type="button" className="bx-btn bx-btn-sm bx-btn-ghost" onClick={()=>{setOpen(true);void load();}}>{ui.open}</button> :
      <section className="bx-private-note-v182-panel" aria-label={ui.open}>
        <div className="bx-private-note-v182-header"><strong>{ui.open}</strong><button type="button" className="bx-btn bx-btn-sm bx-btn-ghost" onClick={close}>{ui.close}</button></div>
        <p>{ui.hint}</p>
        {saved && !needsReload ? <>
          <textarea aria-label={ui.open} value={draft} placeholder={ui.placeholder} rows={3}
            disabled={busy} onChange={e=>{setDraft(Array.from(e.target.value).slice(0,PRIVATE_NOTE_LIMIT_V182).join(''));setNotice('');}}/>
          <div className="bx-private-note-v182-actions">
            <small>{Array.from(draft).length}/{PRIVATE_NOTE_LIMIT_V182}</small>
            <button type="button" className="bx-btn bx-btn-sm bx-btn-primary" disabled={busy||!validPrivateNote(normalizePrivateNote(draft))||normalizePrivateNote(draft)===saved.text}
              onClick={()=>void mutate('PUT')}>{ui.save}</button>
            {saved.revision>0 && <button type="button" className="bx-btn bx-btn-sm bx-btn-ghost" disabled={busy}
              onClick={()=>void mutate('DELETE')}>{ui.remove}</button>}
          </div>
        </> : <button type="button" className="bx-btn bx-btn-sm bx-btn-ghost" disabled={busy} onClick={()=>void load()}>{busy?ui.busy:needsReload?ui.reload:ui.load}</button>}
        {notice && <p role="status">{notice}</p>}
        {error && <p className="bx-error" role="alert">{error}</p>}
      </section>}
  </div>;
}
