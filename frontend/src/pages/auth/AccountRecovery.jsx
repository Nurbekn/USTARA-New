import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { readSiteLocale, siteLocalePath } from '../../utils/siteLocale.js';
import { v144InnerUi } from './innerLocaleV144.js';
import { request } from '../../api/client';
import { AuthLayout, PhoneField } from './components/AuthParts';
import './auth-ui.css';


export default function AccountRecovery() {
  const location = useLocation();
  const lang = readSiteLocale(location.search);
  const ui = v144InnerUi(lang).account;
  const [phone, setPhone] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (phone.replace(/\D/g, '').length !== 9) {
      setMessage(ui.phoneError); return;
    }
    setBusy(true); setMessage('');
    try {
      const response = await request('POST', '/api/auth/account-recovery/start', {
        body: { phone: '+998' + phone.replace(/\D/g, '') },
      });
      setTrackingCode(`${response.caseId}.${response.ticketToken}`);
      setStatus('open');
      setMessage(ui.requestOk);
    } catch (error) { setMessage(error.message || ui.requestFail); }
    finally { setBusy(false); }
  }
  async function check(event) {
    event.preventDefault();
    if (busy) return;
    const parts = trackingCode.trim().split('.');
    if (parts.length !== 2 || !/^[0-9a-f]{32}$/.test(parts[0]) || !/^[0-9a-f]{64}$/.test(parts[1])) {
      setMessage(ui.badTicket); return;
    }
    setBusy(true); setMessage('');
    try {
      const response = await request('POST', '/api/auth/account-recovery/status', {
        body: { caseId: parts[0], ticketToken: parts[1] },
      });
      setStatus(response.status);
      setMessage(ui.statusOk);
    } catch (error) { setMessage(error.message || ui.statusFail); }
    finally { setBusy(false); }
  }
  return <AuthLayout>
    <h1 className="au-title">{ui.title}</h1>
    <p className="au-sub">{ui.intro}</p>
    <form className="au-form" onSubmit={submit}>
      <PhoneField id="recovery-phone" value={phone} onChange={setPhone}/>
      <button type="submit" className="au-btn" disabled={busy}>{busy ? ui.sending : ui.send}</button>
    </form>
    <hr style={{ borderColor: 'var(--border)', margin: '22px 0' }}/>
    <form className="au-form" onSubmit={check}>
      <label className="au-label" htmlFor="recovery-ticket">{ui.ticket}</label>
      <input id="recovery-ticket" className="au-input" type="text" autoComplete="off" spellCheck="false"
        value={trackingCode} onChange={e => setTrackingCode(e.target.value)}
        placeholder={ui.ticketPlaceholder}/>
      {status && <p role="status">{ui.status}: <strong>{Object.hasOwn(ui.states, status) ? ui.states[status] : ui.pending}</strong></p>}
      <button type="submit" className="au-btn" disabled={busy || !trackingCode.trim()}>{ui.check}</button>
    </form>
    {message && <p role="status" className="au-sub" style={{marginTop: 12}}>{message}</p>}
    <p className="au-sub" style={{marginTop: 20}}>
      {ui.disclaimer}
    </p>
    <div className="au-foot"><Link to={siteLocalePath("/forgot-password", lang)}>{ui.forgot}</Link></div>
  </AuthLayout>;
}
