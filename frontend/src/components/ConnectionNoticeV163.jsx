import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { readSiteLocale } from '../utils/siteLocale.js';
import { networkNoticeStatus, networkNoticeCopy } from './networkNoticeV163.js';
import './ConnectionNoticeV163.css';

// Informational notice ONLY: never automatically replay an interrupted booking write.
// navigator.onLine is a device hint, not evidence that the API server is reachable.
export default function ConnectionNoticeV163() {
  const location = useLocation();
  const lang = readSiteLocale(location.search);
  const [state, setState] = useState(() => ({ online: navigator.onLine !== false,
    previouslyOffline: navigator.onLine === false, dismissed: false }));
  useEffect(() => {
    const onOffline = () => setState({ online: false, previouslyOffline: true, dismissed: false });
    const onOnline = () => setState(previous => ({ ...previous, online: true, dismissed: false }));
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => { window.removeEventListener('offline', onOffline); window.removeEventListener('online', onOnline); };
  }, []);
  const status = networkNoticeStatus(state);
  if (status === 'hidden') return null;
  const copy = networkNoticeCopy(lang);
  return <aside className={`ust-network-notice ust-network-notice--${status}`}
    role={status === 'offline' ? 'alert' : 'status'} aria-live="polite">
    <span className="ust-network-notice__dot" aria-hidden="true" />
    <p>{copy[status]}</p>
    {status === 'reconnected' && <button type="button" onClick={() => setState(value => ({ ...value, dismissed: true }))}>{copy.dismiss}</button>}
  </aside>;
}
