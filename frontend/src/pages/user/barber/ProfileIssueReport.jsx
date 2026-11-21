import {useEffect, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {request} from '../../../api/client.js';
import {getSession} from '../../auth/utils/session.js';
import {makeProfileIssuePayload, PROFILE_ISSUE_REASONS, validReportBarberId, parseMyPendingProfileIssues, canSendProfileIssue} from './profileIssueModel.js';
import {profileIssueUiV180} from './profileIssueLocaleV180.js';
import './ProfileIssueReport.css';

export default function ProfileIssueReport({barberId, lang='uz'}) {
  const ui = profileIssueUiV180(lang);
  const [opened, setOpened] = useState(false);
  const [reason, setReason] = useState('address');
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const controllerRef = useRef(null);
  const sendingRef = useRef(false);
  const pendingControllerRef = useRef(null);
  const [pendingReasons, setPendingReasons] = useState([]);
  const [pendingState, setPendingState] = useState('idle');
  const [pendingRevision, setPendingRevision] = useState(0);
  const latestBarberId = useRef(barberId);
  latestBarberId.current = barberId;
  // A route can swap barberId without unmounting the form: never publish a prior profile's result.
  useEffect(() => {
    controllerRef.current?.abort();
    pendingControllerRef.current?.abort();
    setPendingReasons([]);setPendingState('idle');
    controllerRef.current = null;
    sendingRef.current = false;
    setOpened(false); setStatus('idle'); setMessage(''); setDetails(''); setReason('address');
    return () => controllerRef.current?.abort();
  }, [barberId]);
  const session = getSession();
  const valid = makeProfileIssuePayload(reason, details);
  useEffect(() => {
    pendingControllerRef.current?.abort();
    setPendingReasons([]);
    if (!opened || session?.role !== 'customer' || !session?.token || !validReportBarberId(barberId)) {
      setPendingState('idle');
      return;
    }
    const token = session.token;
    const controller = new AbortController();
    pendingControllerRef.current = controller;
    setPendingState('loading');
    void (async () => {
      try {
        const response = await request('GET', `/api/barbers/${barberId}/profile-report/status`, {
          token, signal: controller.signal,
        });
        const pending = parseMyPendingProfileIssues(response);
        if (!pending) throw new Error('Invalid profile report status');
        if (controller.signal.aborted || latestBarberId.current !== barberId || getSession()?.token !== token) return;
        setPendingReasons(pending);setPendingState('ready');
      } catch (_) {
        if (controller.signal.aborted || latestBarberId.current !== barberId || getSession()?.token !== token) return;
        setPendingState('error');
      }
    })();
    return () => controller.abort();
  }, [barberId, opened, session?.token, session?.role, pendingRevision]);
  async function submit(event) {
    event.preventDefault();
    if (!canSendProfileIssue({payload:valid, pendingReasons, reason, pendingState, status, sending:sendingRef.current}) || !validReportBarberId(barberId)) return;
    const token = getSession()?.token;
    if (!token) {setStatus('error');setMessage(ui.noSession);return;}
    sendingRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus('sending');setMessage('');
    try {
      const response = await request('POST', `/api/barbers/${barberId}/profile-report`, {
        token, body: valid, signal: controller.signal,
      });
      if (controller.signal.aborted || latestBarberId.current !== barberId || getSession()?.token !== token) return;
      if (response?.accepted !== true) throw new Error(ui.badResponse);
      setStatus('sent');setDetails('');
      setPendingReasons(previous => [...new Set([...previous, reason])]);setPendingState('ready');
      setMessage(ui.sent);
    } catch (error) {
      if (controller.signal.aborted || latestBarberId.current !== barberId || getSession()?.token !== token) return;
      setStatus('error');
      setMessage(error?.status === 409 ? ui.duplicate
        : error?.status === 401 ? ui.expired
        : error?.status === 400 ? ui.invalid
        : ui.unknown);
      // A failed/ambiguous POST never unlocks another POST until a fresh server status read.
      setPendingState('idle');
      setPendingRevision(previous => previous + 1);
    } finally {
      // An old aborted response must never clear a newer request's lock or UI.
      if (controllerRef.current === controller) {
        sendingRef.current = false;
        controllerRef.current = null;
        if (getSession()?.token !== token && !controller.signal.aborted) {
          setStatus('idle'); setMessage('');
        }
      }
    }
  }
  function close() {
    pendingControllerRef.current?.abort();
    controllerRef.current?.abort();
    controllerRef.current = null;
    sendingRef.current = false;
    setOpened(false); setStatus('idle'); setMessage('');
  }
  return <section className="bpv-report" aria-label={ui.title}>
    <button type="button" className="bpv-report-toggle" aria-expanded={opened} onClick={() => opened ? close() : setOpened(true)}>
      {opened ? ui.close : ui.open}
    </button>
    {opened && (session?.token && session?.role === 'customer' ? <form onSubmit={submit}>
      <p>{ui.hint}</p>
      <label>{ui.reason}
        <select value={reason} onChange={event => {setReason(event.target.value);setMessage('');setStatus('idle');}} disabled={status === 'sending' || status === 'sent'}>
          {PROFILE_ISSUE_REASONS.map(([key]) => <option key={key} value={key}>{ui.reasons[key]}</option>)}
        </select>
      </label>
      <label>{ui.details}
        <textarea value={details} maxLength={500} minLength={10} rows={3} onChange={event => {setDetails(event.target.value);setMessage('');setStatus('idle');}} disabled={status === 'sending' || status === 'sent'} required />
      </label>
      {pendingState === 'loading' && <p role="status">{ui.pendingLoading}</p>}
      {pendingState === 'error' && <p role="status">{ui.pendingError}</p>}
      {pendingReasons.includes(reason) && <p role="status">{ui.pendingDuplicate}</p>}
      {pendingState === 'error' && <button type="button" onClick={() => setPendingRevision(previous => previous + 1)}>{ui.retry}</button>}
      <button type="submit" disabled={!canSendProfileIssue({payload:valid, pendingReasons, reason, pendingState, status, sending:sendingRef.current})}>{status === 'sending' ? ui.sending : ui.submit}</button>
      {message && <p role={status === 'error' ? 'alert' : 'status'}>{message}</p>}
    </form> : <p>{ui.loginRequired} <Link to="/login">{ui.login}</Link>.</p>)}
  </section>;
}
