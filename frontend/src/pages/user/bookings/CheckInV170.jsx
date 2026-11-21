import {useEffect,useState} from 'react';
import {canRequestCheckIn,checkInUi,mutateCheckIn} from './checkInV170.js';

export default function CheckInV170({booking,lang='uz',onSaved}) {
  const ui=checkInUi(lang);
  const [now,setNow]=useState(Date.now());
  const [busy,setBusy]=useState(false);
  const [reloadRequired,setReloadRequired]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30_000);return ()=>clearInterval(timer);},[]);
  useEffect(()=>{setError('');setReloadRequired(false);},[booking.id]);
  async function report() {
    if (busy || reloadRequired || !canRequestCheckIn(booking,Date.now())) return;
    setBusy(true);setError('');
    try {
      await mutateCheckIn(booking.id,'customer');
      setReloadRequired(true);
      onSaved?.(); // Always refresh from server; do not invent a confirmed local status.
    } catch (err) {
      setError(err.message || ui.failed);
      setReloadRequired(true); // even a lost response may have committed
    } finally {setBusy(false);}
  }
  return <section className="ub-panel" aria-label={ui.title}>
    <h2>{ui.title}</h2>
    <p className="ub-hint">{ui.hint}</p>
    {booking.checkIn
      ? <p role="status"><strong>{booking.checkIn.confirmedAt ? ui.confirmed : ui.pending}</strong></p>
      : reloadRequired
        ? <button type="button" className="ub-button" onClick={onSaved}>{ui.reload}</button>
        : canRequestCheckIn(booking,now)
          ? <button type="button" className="ub-button ub-primary" disabled={busy} onClick={report}>{busy ? ui.busy : ui.report}</button>
          : <p className="ub-hint">{ui.unavailable}</p>}
    {error && <p className="ub-action-error" role="alert">{error}</p>}
  </section>;
}
