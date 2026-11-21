import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getSession, subscribeSession } from '../pages/auth/utils/session.js';
import { readSiteLocale } from '../utils/siteLocale.js';
import { request } from '../api/client.js';
import { validatePrivacyExport } from './privacyExportV183.js';

const messages = {
  uz:{ title:'Maxfiylik markazi (boshlang‘ich)', info:'Profilingiz va bronlaringizning asosiy ma’lumotlarini JSON formatda oling. Bu to‘liq ma’lumotlar eksporti emas: chatlar, suratlar va boshqa ayrim ma’lumotlar hozircha kiritilmaydi. Faylda telefon raqamingiz bo‘ladi, uni xavfsiz saqlang.', button:'Ma’lumotlarimni yuklab olish', working:'Tayyorlanyapti…', expired:'Sessiya o‘zgardi. Qayta kiring.', error:'Eksport bajarilmadi. Qayta urinib ko‘ring.' },
  ru:{ title:'Центр конфиденциальности (начальный)', info:'Скачайте основные данные профиля и записей в JSON. Это не полный экспорт: чаты, фотографии и некоторые другие данные пока не входят. Файл содержит ваш номер телефона; храните его безопасно.', button:'Скачать мои данные', working:'Подготовка…', expired:'Сессия изменилась. Войдите снова.', error:'Не удалось скачать данные. Попробуйте снова.' },
  en:{ title:'Privacy Center (initial)', info:'Download basic profile and booking data as JSON. This is not a complete export: chats, photos and other data are not included yet. The file contains your phone number; store it securely.', button:'Download my data', working:'Preparing…', expired:'Session changed. Sign in again.', error:'Export failed. Please try again.' },
};
export default function PrivacyExportV183({ className = '' }) {
  const lang = readSiteLocale(useLocation().search);
  const copy = messages[lang] || messages.uz;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const task = useRef(null);
  useEffect(() => {
    const invalidate = () => { task.current?.abort(); task.current = null; setBusy(false); setError(''); };
    const unsubscribe = subscribeSession(invalidate);
    return () => { unsubscribe(); invalidate(); };
  }, []);
  async function download() {
    if (task.current) return;
    const session = getSession();
    if (!session?.token || !['customer','barber'].includes(session.role)) { setError(copy.expired); return; }
    const controller = new AbortController(); task.current = controller;
    setBusy(true); setError('');
    try {
      const result = await request('GET','/api/privacy/export', { token:session.token, signal:controller.signal });
      // Another tab/logout must never download data under the new identity.
      const current = getSession();
      if (controller.signal.aborted || current?.token !== session.token ||
        current?.accountId !== session.accountId || current?.profileId !== session.profileId ||
        current?.role !== session.role || result?.profile?.id !== session.profileId ||
        result?.account?.phone !== session.phone || !validatePrivacyExport(result,session.role)) throw new Error(copy.expired);
      const blob = new Blob([JSON.stringify(result, null, 2)], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = `ustara-my-data-${session.role}.json`;
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
      } finally { URL.revokeObjectURL(url); }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause.message || copy.error);
    } finally { if (task.current === controller) { task.current = null; setBusy(false); } }
  }
  return <section style={{marginTop:16}} aria-label={copy.title}>
    <h3>{copy.title}</h3><p>{copy.info}</p>
    <button type="button" className={className} onClick={download} disabled={busy}>
      {busy ? copy.working : copy.button}
    </button>
    {error && <p role="alert" style={{color:'#fb7185'}}>{error}</p>}
  </section>;
}
