import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { readSiteLocale, siteLocalePath } from '../utils/siteLocale.js';
import { accountBarberUi } from './accountLocaleV145.js';
import { request } from '../api/client';
import { clearSession, getSession } from '../pages/auth/utils/session';

/** Security Center action. No tokens are sent to other devices or displayed. */
export default function RevokeSessionsAction({ className = '' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const lang = readSiteLocale(location.search);
  const copy = accountBarberUi(lang).revoke;

  async function revoke() {
    if (busy || !window.confirm(copy.confirm)) return;
    setError(''); setBusy(true);
    try {
      const session = getSession();
      if (!session?.token) throw new Error(copy.missing);
      await request('POST', '/api/auth/sessions/revoke-all', { token: session.token });
      clearSession();
      navigate(siteLocalePath('/login', lang), { replace: true });
    } catch (cause) {
      setError(cause.message || copy.failure);
    } finally { setBusy(false); }
  }
  return <div>
    <button type="button" className={className} onClick={revoke} disabled={busy}>
      {busy ? copy.busy : copy.button}
    </button>
    {error && <p role="alert" style={{ color: '#fb7185', marginTop: 8 }}>{error}</p>}
  </div>;
}
