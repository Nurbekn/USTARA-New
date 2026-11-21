import { useLocation } from "react-router-dom";
import { readSiteLocale } from "../../../utils/siteLocale.js";
import { barberOpsText } from "../barberOpsLocaleV146.js";
import { useEffect, useState } from 'react';
import { request } from '../../../api/client.js';
import { getSession } from '../../auth/utils/session.js';

const presets = [
  { value: 'none', label: 'Cheklovsiz' },
  { value: '0', label: 'Bron boshlanguncha' },
  { value: '30', label: '30 daqiqa oldin' },
  { value: '60', label: '1 soat oldin' },
  { value: '120', label: '2 soat oldin' },
  { value: '360', label: '6 soat oldin' },
  { value: '1440', label: '1 kun oldin' },
  { value: '2880', label: '2 kun oldin' },
];
export default function CancellationPolicyEditor({ enabled }) {
  const lang = readSiteLocale(useLocation().search);
  const tr = barberOpsText(lang);
  const [status, setStatus] = useState('loading');
  const [cutoff, setCutoff] = useState('none');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const session = getSession();
    if (session?.role !== 'barber' || !session.token) { setStatus('error'); setError('Sartarosh sessiyasi topilmadi.'); return; }
    setStatus('loading');
    request('GET', '/api/barbers/cancellation-policy', { token: session.token, signal: controller.signal })
      .then(policy => {
        if (controller.signal.aborted) return;
        if (!policy || !(policy.cutoff_minutes === null || Number.isInteger(policy.cutoff_minutes))) throw Error(tr("Qoidalar noto‘g‘ri qaytdi."));
        const minutes = policy.cutoff_minutes === null ? 'none' : String(policy.cutoff_minutes);
        setCutoff(minutes); setNote(policy.text || ''); setSaved({ cutoff: minutes, note: policy.text || '' }); setStatus('ready'); setError('');
      }).catch(cause => { if (!controller.signal.aborted) { setStatus('error'); setError(cause.message || tr("Qoidalar yuklanmadi.")); } });
    return () => controller.abort();
  }, [enabled]);
  const dirty = saved && (cutoff !== saved.cutoff || note !== saved.note);
  async function submit(event) {
    event.preventDefault();
    if (status !== 'ready') return;
    const numeric = cutoff === 'none' ? null : Number(cutoff);
    if ((numeric !== null && (!Number.isInteger(numeric) || numeric < 0 || numeric > 10080)) || note.trim().length > 280) {
      setError(tr("Muddat 0–10080 daqiqa, izoh 280 belgigacha bo‘lishi kerak.")); return;
    }
    const session = getSession();
    if (session?.role !== 'barber' || !session.token) { setError('Qayta tizimga kiring.'); return; }
    setStatus('saving'); setError('');
    try {
      const result = await request('PUT', '/api/barbers/cancellation-policy', {
        token: session.token, body: { cutoff_minutes: numeric, text: note },
      });
      const next = { cutoff: result.cutoff_minutes === null ? 'none' : String(result.cutoff_minutes), note: result.text || '' };
      setCutoff(next.cutoff); setNote(next.note); setSaved(next); setStatus('ready');
    } catch (cause) { setStatus('ready'); setError(cause.message || tr("Qoidalarni saqlab bo‘lmadi.")); }
  }
  return <section className="bx-card" aria-label={tr("Bekor qilish qoidalari")}>
    <h2>{tr("Bronni bekor qilish qoidalari")}</h2>
    <p className="bx-muted">{tr("Bu qoida faqat yangi bronlarga yoziladi. Eski bron shartlari o‘zgarmaydi. Onlayn jarima yoki to‘lov olinmaydi.")}</p>
    {status === 'loading' && <p role="status">{tr("Qoidalar yuklanmoqda…")}</p>}
    {status !== 'loading' && <form onSubmit={submit} style={{ display:'grid', gap:12, marginTop:12 }}>
      <label htmlFor="bx-cancellation-cutoff">{tr("Mijoz qachongacha bekor qila oladi?")}</label>
      <select id="bx-cancellation-cutoff" value={cutoff} disabled={status !== 'ready'} onChange={e => setCutoff(e.target.value)}>
        {presets.map(preset => <option key={preset.value} value={preset.value}>{tr(preset.label)}</option>)}
      </select>
      <label htmlFor="bx-cancellation-text">{tr("Mijozga izoh (ixtiyoriy, 280 belgigacha)")}</label>
      <textarea id="bx-cancellation-text" value={note} maxLength={280} rows={3} disabled={status !== 'ready'} onChange={e => setNote(e.target.value)} placeholder={tr("Masalan, kelolmasangiz oldindan xabar bering.")} />
      <button type="submit" className="bx-btn bx-btn-primary" disabled={status !== 'ready' || !dirty}> {status === 'saving' ? tr("Saqlanmoqda…") : tr("Qoidalarni saqlash")} </button>
    </form>}
    {!!error && <p role="alert" className="bx-error">{error}</p>}
  </section>;
}
