import { useEffect, useState } from 'react';
import { request } from '../../../api/client.js';

export default function TelegramOtpNotice({ registrationUrl, awaiting = false, compact = false }) {
  const [botUrl, setBotUrl] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (registrationUrl) return;
    const controller = new AbortController();
    request('GET', '/api/auth/telegram', { signal: controller.signal }).then((data) => {
      if (!/^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}$/.test(data?.botUrl || '')) throw new Error('invalid_bot');
      setBotUrl(data.botUrl);
      setError('');
    }).catch(() => {
      if (!controller.signal.aborted) setError('Telegram botga ulanish olinmadi. Qayta tekshiring.');
    });
    return () => controller.abort();
  }, [retry, registrationUrl]);
  const safeRegistrationUrl = /^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}$/.test(registrationUrl || '') ? registrationUrl : '';
  const target = safeRegistrationUrl || botUrl;
  return <aside className={`au-telegram-notice${compact ? " au-telegram-notice--compact" : ""}`} aria-label="Telegram orqali kod olish">
    {!compact && <strong>Tasdiqlash kodi Telegramga keladi</strong>}
    {!compact && <p>{registrationUrl ? 'Botda Start tugmasini bosing va «Telefon raqamimni ulashish» orqali kontaktingizni yuboring. Keyin saytga qaytib kodni kiriting.' : 'Kod avval hisobingizga bog‘langan Telegram chatiga keladi. Bot bloklangan bo‘lsa, uni qayta oching. Telegramga bog‘lanmagan eski hisobni tiklash uchun administratorga murojaat qiling.'}</p>}
    {awaiting && !compact && <p role="status">Botdan kod olishingiz kutilmoqda…</p>}
    {target && <a className="au-btn" href={target} target="_blank" rel="noopener noreferrer">{compact ? "Telegramdan kod olish" : "Telegram botni ochish"}</a>}
    {error && <p className="au-error" role="alert">{error} <button className="au-text-btn" type="button" onClick={() => setRetry((n) => n + 1)}>Qayta tekshirish</button></p>}
    {!target && !error && <p role="status">Telegram bot yuklanmoqda…</p>}
  </aside>;
}
