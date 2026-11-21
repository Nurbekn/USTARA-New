import { useEffect, useState } from 'react';
import { MINUTE_CHOICES,lateNoticeAllowed,lateNoticeUi,sendLateNotice } from './lateNoticeV169.js';

export default function LateNoticeV169({ booking, lang='uz', onSaved }) {
  const ui=lateNoticeUi(lang);
  const [minutes,setMinutes]=useState(10);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [mustReload,setMustReload]=useState(false);
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),30_000);return ()=>clearInterval(id);},[]);
  useEffect(()=>{setError('');setMustReload(false);setMinutes(10);},[booking.id]);
  const allowed=lateNoticeAllowed(booking,now);
  async function submit(event) {
    event.preventDefault();
    if (busy || mustReload || !lateNoticeAllowed(booking,Date.now())) return;
    setBusy(true);setError('');
    try {
      await sendLateNotice(booking.id,minutes);
      setMustReload(true); // Only a fresh GET confirms the stored notice after mutations.
      onSaved();
    } catch(err) {
      setError(err.message || ui.failed);
      // Unknown commit outcomes are never retried automatically.
      if (err.code === 'late_notice_unknown' || err.code === 'network_error' || err.code === 'request_timeout' || err.code === 'session_changed') setMustReload(true);
    } finally {setBusy(false);}
  }
  return <section className="ub-panel" aria-labelledby="ub-late-notice-title">
    <h2 id="ub-late-notice-title">{ui.title}</h2>
    <p className="ub-hint">{ui.hint}</p>
    {booking.lateNotice ? <p role="status"><strong>{ui.reported}:</strong> {booking.lateNotice.minutes} {ui.minutes.toLowerCase()} · {ui.notConfirmed}</p>
    : mustReload ? <button type="button" className="ub-button" onClick={onSaved}>{ui.reload}</button>
    : allowed ? <form onSubmit={submit}>
      <label htmlFor="ub-late-minutes">{ui.minutes}</label>{' '}
      <select id="ub-late-minutes" value={minutes} onChange={e=>setMinutes(Number(e.target.value))} disabled={busy}>
        {MINUTE_CHOICES.map(m=><option key={m} value={m}>{m}</option>)}
      </select>{' '}
      <button className="ub-button ub-primary" type="submit" disabled={busy}>{busy ? ui.sending : ui.send}</button>
    </form> : <p className="ub-hint">{ui.disabled}</p>}
    {error && <p className="ub-action-error" role="alert">{error}</p>}
  </section>;
}
