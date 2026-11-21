import { useEffect, useRef, useState } from 'react';
import { getSession, subscribeSession } from '../../auth/utils/session.js';
import { loadMySocialReportsV177 } from './model.js';
import { normalizeReportReceiptsV177, socialReportReceiptsTextV177 } from './socialReportReceiptsV177.js';

export default function MyReportsV177({ lang = 'uz', onClose, loadReports = loadMySocialReportsV177 }) {
  const t = socialReportReceiptsTextV177[lang] || socialReportReceiptsTextV177.uz;
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState({ status: 'loading', reports: [] });
  const initialAccount = useRef(getSession()?.accountId);
  // Do not leave an old account's receipts visible on a logout/account switch.
  useEffect(() => subscribeSession(() => {
    if (getSession()?.accountId !== initialAccount.current) onClose();
  }), [onClose]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.resolve().then(() => loadReports({ signal: controller.signal }))
      .then(normalizeReportReceiptsV177)
      .then(reports => { if (active) setState({ status: 'ready', reports }); })
      .catch(() => { if (active) setState({ status: 'error', reports: [] }); });
    return () => { active = false; controller.abort(); };
  }, [loadReports, refresh]);
  return <section className="so-my-reports-v177" aria-label={t.title}>
    <div className="so-my-reports-v177-head">
      <h2>{t.title}</h2>
      <div>
        <button type="button" className="so-text-button" onClick={() => { setState({ status: 'loading', reports: [] }); setRefresh(n => n + 1); }}>{t.reload}</button>
        <button type="button" className="so-text-button" onClick={onClose}>{t.close}</button>
      </div>
    </div>
    <p className="so-hint">{t.note}</p>
    {state.status === 'loading' && <p role="status">{t.loading}</p>}
    {state.status === 'error' && <p role="alert">{t.error}</p>}
    {state.status === 'ready' && (state.reports.length ? <ul>
      {state.reports.map(item => <li key={item.id}>
        <strong>{t.receipt} #{item.id}</strong> · {t.post} #{item.postId} · {t.reasons[item.reason]}
        <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(lang === 'uz' ? 'uz-UZ' : lang === 'ru' ? 'ru-RU' : 'en-US')}</time>
      </li>)}
    </ul> : <p>{t.empty}</p>)}
  </section>;
}
