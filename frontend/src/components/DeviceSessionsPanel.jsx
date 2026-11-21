import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { readSiteLocale, siteLocalePath } from '../utils/siteLocale.js';
import { accountBarberUi } from './accountLocaleV145.js';
import { request } from '../api/client';
import { clearSession, getSession } from '../pages/auth/utils/session';

/** #84: show only safe device labels, never IP addresses or tokens. */
export default function DeviceSessionsPanel({ className = '' }) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const lang = readSiteLocale(location.search);
  const ui = accountBarberUi(lang);
  const copy = ui.devices;
  const load = async () => {
    setLoading(true); setError('');
    try {
      const auth = getSession();
      if (!auth?.token) throw Error(ui.loginAgain);
      const data = await request('GET', '/api/auth/sessions/devices', {token:auth.token});
      setSessions(data.sessions || []);
    } catch (cause) { setError(cause.message || copy.error); }
    finally { setLoading(false); }
  };
  const toggle = () => {
    if (!open) { setOpen(true); void load(); }
    else setOpen(false);
  };
  const revoke = async (item) => {
    if (!window.confirm(`${item.label} ${copy.confirm}`)) return;
    setLoading(true); setError('');
    try {
      const auth = getSession();
      if (!auth?.token) throw Error(ui.loginAgain);
      await request('POST', `/api/auth/sessions/devices/${item.id}/revoke`, {token:auth.token});
      if (item.current) { clearSession(); navigate(siteLocalePath('/login', lang), {replace:true}); return; }
      await load();
    } catch (cause) { setError(cause.message || ui.genericError); }
    finally { setLoading(false); }
  };
  return <div style={{marginTop:12}}>
    <button className={className} type="button" onClick={toggle} aria-expanded={open}>
      {open ? copy.toggleClose : copy.toggleOpen}
    </button>
    {open && <section aria-label={copy.title} style={{padding:'12px 0'}}>
      <p style={{fontSize:13}}>{copy.intro}</p>
      {loading && <p role="status">{copy.loading}</p>}
      {error && <p role="alert" style={{color:'#fb7185'}}>{error} <button type="button" onClick={load}>{ui.retry}</button></p>}
      {!loading && !error && sessions.length === 0 && <p>{copy.empty}</p>}
      {sessions.map(item => <div key={item.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'8px 0',borderBottom:'1px solid #64748b44'}}>
        <div><strong>{item.label}</strong>{item.current && <span> · {copy.current}</span>}
          <div style={{fontSize:12,opacity:.75}}>{new Date(item.createdAt).toLocaleString(lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-GB' : 'uz-UZ')}</div>
        </div>
        <button type="button" disabled={loading} onClick={() => revoke(item)}>{copy.signOut}</button>
      </div>)}
    </section>}
  </div>;
}
