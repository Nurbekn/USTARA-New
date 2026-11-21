import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { readSiteLocale, siteLocalePath } from '../../utils/siteLocale.js';
import { accountBarberUi } from '../accountLocaleV145.js';
import { PhoneField } from '../../pages/auth/components/AuthParts';
import PasswordField from '../../pages/auth/components/PasswordField';
import { clearSession } from '../../pages/auth/utils/session';
import { insertOtp, secondsUntil, serverDeadline, phoneChangeRequest } from './model';
import '../../pages/auth/auth-ui.css';
import './PhoneChangePanel.css';

export default function PhoneChangePanel({ currentPhone, startWithPassword = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const lang = readSiteLocale(location.search);
  const ui = accountBarberUi(lang);
  const copy = ui.phone;
  const [step, setStep] = useState(startWithPassword ? 'password' : 'idle');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [session, setSession] = useState(null);
  const [otp, setOtp] = useState(Array(5).fill(''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const inputs = useRef([]);
  const flight = useRef(false);
  const controllers = useRef(new Set());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const active = controllers.current;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { mounted.current = false; clearInterval(timer); for (const c of active) c.abort(); };
  }, []);
  useEffect(() => { if (step === 'otp') inputs.current[0]?.focus(); }, [step, session?.deliveryPending]);
  function updated(data, previous) {
    const receivedAt = Date.now();
    return { ...previous, ...data,
      expiresAtLocal: data.expiresAt ? serverDeadline(data.expiresAt, data.serverNow, receivedAt) : previous?.expiresAtLocal,
      otpExpiresAtLocal: serverDeadline(data.otpExpiresAt, data.serverNow, receivedAt),
      resendAtLocal: serverDeadline(data.resendAvailableAt, data.serverNow, receivedAt),
    };
  }
  async function call(action, body) {
    const controller = new AbortController(); controllers.current.add(controller);
    try { return await phoneChangeRequest(action, body, controller.signal); }
    finally { controllers.current.delete(controller); }
  }
  function failure(e) {
    setError(e.message || ui.genericError);
    if (e.code === 'phone_change_expired') setExpired(true);
    if (e.metadata?.retryAfter) setRetryAt(Date.now() + e.metadata.retryAfter * 1000);
    if (Number.isInteger(e.metadata?.attemptsRemaining)) setSession(previous => ({ ...previous, attemptsRemaining: e.metadata.attemptsRemaining }));
    if (e.code === 'invalid_otp') { setOtp(Array(5).fill('')); inputs.current[0]?.focus(); }
  }
  useEffect(() => {
    if (step !== 'otp' || !session?.deliveryPending || expired) return;
    let active = true, running = false;
    const poll = async () => {
      if (!active || running || flight.current || document.visibilityState === 'hidden' || Date.now() < retryAt) return;
      running = true;
      const controller = new AbortController(); controllers.current.add(controller);
      try {
        const data = await phoneChangeRequest('status', { sessionToken: session.sessionToken }, controller.signal);
        if (active) { setSession(previous => updated(data, previous)); setError(''); }
      } catch (e) { if (active) failure(e); }
      finally { controllers.current.delete(controller); running = false; }
    };
    const timer = setInterval(poll, 3000);
    window.addEventListener('focus', poll);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', poll); };
  }, [step, session?.deliveryPending, session?.sessionToken, expired, retryAt]);
  useEffect(() => {
    if (step !== 'success') return;
    const timer = setTimeout(() => {
      // Clear credentials silently, then leave the protected tree in the same
      // navigation. A synchronous logout event would replace its success state.
      clearSession({ notify: false });
      navigate(siteLocalePath('/login', lang), { replace: true, state: { phoneChanged: true, phone } });
    }, 900);
    return () => clearTimeout(timer);
  }, [step, navigate, phone, lang]);
  const sessionExpired = expired || !!session && session.expiresAtLocal <= now;
  const cooldown = secondsUntil(Math.max(session?.resendAtLocal || 0, retryAt), now);
  const retry = secondsUntil(retryAt, now);
  const codeExpired = session?.otpExpiresAtLocal > 0 && session.otpExpiresAtLocal <= now;
  async function submit(event) {
    event.preventDefault();
    if (flight.current || retry) return;
    flight.current = true; setBusy(true); setError('');
    try {
      if (step === 'password') {
        const data = await call('start', { password });
        if (!mounted.current) return;
        setPassword(''); setSession(updated(data, null)); setStep('phone');
      } else if (step === 'phone') {
        const full = '+998' + phone.replace(/\D/g, '');
        if (!/^\+998\d{9}$/.test(full)) throw new Error(copy.invalidPhone);
        if (full === currentPhone) throw new Error(copy.samePhone);
        const data = await call('choose', { sessionToken: session.sessionToken, phone: full });
        if (!mounted.current) return;
        setSession(previous => updated(data, previous)); setStep('otp');
      } else if (step === 'otp') {
        await call('verify', { sessionToken: session.sessionToken, otp: otp.join('') });
        if (mounted.current) setStep('success');
      }
    } catch (e) { if (mounted.current) failure(e); }
    finally { flight.current = false; if (mounted.current) setBusy(false); }
  }
  async function resend() {
    if (flight.current || cooldown || sessionExpired) return;
    flight.current = true; setBusy(true); setError('');
    try {
      await call('resend', { sessionToken: session.sessionToken });
      const data = await call('status', { sessionToken: session.sessionToken });
      if (mounted.current) { setSession(previous => updated(data, previous)); setOtp(Array(5).fill('')); inputs.current[0]?.focus(); }
    } catch (e) { if (mounted.current) failure(e); }
    finally { flight.current = false; if (mounted.current) setBusy(false); }
  }
  function enter(index, value) {
    const next = insertOtp(otp, index, value);
    setOtp(next.digits); setError(''); inputs.current[next.focus]?.focus();
  }
  function restart() { setStep('password'); setSession(null); setPassword(''); setOtp(Array(5).fill('')); setError(''); setExpired(false); }
  if (step === 'idle') return <div className="pc-panel"><p className="pc-current">{copy.current} <strong>{currentPhone}</strong></p><button className="pc-primary" type="button" onClick={() => setStep('password')}>{copy.change}</button></div>;
  if (step === 'success') return <div className="pc-panel" role="status"><h2>{copy.success}</h2><p>{copy.successHelp}</p></div>;
  if (sessionExpired) return <div className="pc-panel"><p role="alert">{copy.expired}</p><button className="pc-primary" type="button" onClick={restart}>{copy.restart}</button></div>;
  return <form className="pc-panel" onSubmit={submit} aria-busy={busy}>
    <p className="pc-step">{step === 'password' ? `1 / 3 · ${copy.stepPassword}` : step === 'phone' ? `2 / 3 · ${copy.stepPhone}` : `3 / 3 · ${copy.stepOtp}`}</p>
    <fieldset disabled={busy}>
      {step === 'password' && <PasswordField value={password} onChange={setPassword}/>}
      {step === 'phone' && <PhoneField id="phone-change-number" value={phone} onChange={setPhone}/>}
      {step === 'otp' && <>
        <p className="pc-destination">{session.newPhone}</p>
        <a className="pc-bot" href={session.botUrl} target="_blank" rel="noopener noreferrer">{copy.openBot} ↗</a>
        {session.deliveryPending ? <p role="status">{copy.pending}</p> : <>
          <label id="pc-otp-label">{copy.codeLabel}</label>
          <div className="pc-otp" role="group" aria-labelledby="pc-otp-label">{otp.map((digit, index) => <input key={index} ref={node => { inputs.current[index] = node; }} type="text" inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'} aria-label={`${index + 1}-${copy.digit}`} value={digit} disabled={codeExpired || session.attemptsRemaining === 0} onChange={e => enter(index, e.target.value)} onFocus={e => e.target.select()} onPaste={e => { e.preventDefault(); enter(index, e.clipboardData.getData('text')); }} onKeyDown={e => {
            if (e.key === 'Backspace' && !digit && index > 0) { e.preventDefault(); const next = [...otp]; next[index - 1] = ''; setOtp(next); inputs.current[index - 1]?.focus(); }
            if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); inputs.current[index - 1]?.focus(); }
            if (e.key === 'ArrowRight' && index < 4) { e.preventDefault(); inputs.current[index + 1]?.focus(); }
          }}/>)}</div>
          {codeExpired && <p role="status">{copy.codeExpired}</p>}
          <button type="button" className="pc-resend" onClick={resend} disabled={cooldown > 0 || session.sendsRemaining === 0 || session.attemptsRemaining === 0}>{cooldown ? `${copy.codeCountdown}: ${cooldown} s` : copy.newCode}</button>
          {(session.sendsRemaining === 0 || session.attemptsRemaining === 0) && <p role="status">{copy.attempts}</p>}
        </>}
      </>}
      {error && <p className="pc-error" role="alert">{error}</p>}
      {retry > 0 && <p role="status">{copy.retryCountdown}: {retry} s</p>}
      {(step !== 'otp' || !session.deliveryPending) && <button className="pc-primary" type="submit" disabled={retry > 0 || (step === 'password' && !password) || (step === 'otp' && (otp.some(d => !d) || codeExpired || session.attemptsRemaining === 0))}>{busy ? ui.checking : step === 'password' ? copy.next : step === 'phone' ? copy.confirmPhone : copy.verify}</button>}
    </fieldset>
  </form>;
}
