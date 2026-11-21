import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { readSiteLocale, siteLocalePath } from '../utils/siteLocale.js';
import { accountBarberUi } from './accountLocaleV145.js';
import { request } from '../api/client';
import { clearSession, getSession } from '../pages/auth/utils/session';

// Explicitly separate this reversible pause from permanent account deletion.
export default function DeactivateAccountAction({ className = '' }) {
  const [password, setPassword] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const lang = readSiteLocale(location.search);
  const ui = accountBarberUi(lang);
  const copy = ui.deactivate;
  async function submit(event) {
    event.preventDefault();
    if (busy || !password.trim()) return;
    if (!window.confirm(copy.confirm)) return;
    setBusy(true); setError('');
    try {
      const session = getSession();
      if (!session?.token) throw new Error(ui.loginAgain);
      await request('POST', '/api/auth/account/deactivate', { token: session.token, body: { password } });
      setPassword('');
      clearSession();
      navigate(siteLocalePath('/login', lang), { replace: true });
    } catch (cause) {
      setError(cause.message || copy.failure);
      setPassword('');
    } finally { setBusy(false); }
  }
  return <div style={{ marginTop: 14 }}>
    <button className={className} type="button" onClick={() => { setExpanded(v => !v); setError(''); }}>
      {copy.button}
    </button>
    {expanded && <form onSubmit={submit} style={{ marginTop: 8 }}>
      <p>{copy.info}</p>
      <label style={{ display: 'block', marginBottom: 8 }}>
        {copy.password}
        <input type="password" autoComplete="current-password" value={password}
          onChange={event => setPassword(event.target.value)} required maxLength={1024}
          style={{ display: 'block', width: '100%', maxWidth: 340, padding: 10, marginTop: 5 }} />
      </label>
      <button type="submit" className={className} disabled={busy || !password.trim()}>
        {busy ? ui.checking : copy.submit}
      </button>
    </form>}
    {error && <p role="alert" style={{ color: '#fb7185' }}>{error}</p>}
  </div>;
}
