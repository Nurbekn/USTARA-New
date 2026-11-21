import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getSession, subscribeSession } from '../pages/auth/utils/session.js';
import { request } from '../api/client.js';
import { readSiteLocale } from '../utils/siteLocale.js';
import {safeCustomerTelegramLink, sameCustomerSession, validCustomerTelegramStatus} from './customerTelegramModelV190.js';
import CustomerBookingNotificationHistoryV191 from './CustomerBookingNotificationHistoryV191.jsx';

const copy = {
  uz: {title:'Telegram aloqasi',loading:'Bog‘lanish holati tekshirilmoqda…',linked:'Telegram hisobingiz tasdiqlangan.',unlinked:'Telegram xabarlariga ulanish hali yo‘q.',connect:'Telegram’ni bog‘lash',open:'Botda tasdiqlash',refresh:'Holatni tekshirish',disconnect:'Bog‘lanishni uzish',enable:'Bron bildirishnomalariga roziman',disable:'Bildirishnomalarga rozilikni bekor qilish',pending:'Telegram botining shaxsiy chatida havolani oching. Havola 5 daqiqa amal qiladi.',info:'OTP uchun telefon kontaktini ulash bron bildirishnomalariga rozilik degani emas. Bildirishnomalar faqat xabar yuborish xizmati serverda alohida yoqilgandan keyin kelishi mumkin.',error:'Telegram sozlamalarini olish imkoni bo‘lmadi. Qayta urinib ko‘ring.',session:'Sessiya o‘zgardi. Qayta kiring.',confirm:'Telegram aloqasini va bildirishnoma roziligini uzasizmi?'},
  ru: {title:'Связь через Telegram',loading:'Проверяем привязку…',linked:'Аккаунт Telegram подтверждён.',unlinked:'Telegram пока не привязан.',connect:'Подключить Telegram',open:'Подтвердить в боте',refresh:'Проверить статус',disconnect:'Отключить',enable:'Разрешаю уведомления о записях',disable:'Отозвать согласие на уведомления',pending:'Откройте ссылку в личном чате бота. Она действует 5 минут.',info:'Контакт для OTP не означает согласия на уведомления. Отправка возможна только после отдельного включения сервиса уведомлений на сервере.',error:'Не удалось получить настройки Telegram.',session:'Сессия изменилась. Войдите снова.',confirm:'Отключить связь и отозвать согласие?'},
  en: {title:'Telegram contact',loading:'Checking link…',linked:'Telegram account verified.',unlinked:'Telegram is not connected.',connect:'Link Telegram',open:'Verify in bot',refresh:'Check status',disconnect:'Unlink Telegram',enable:'I consent to booking notifications',disable:'Withdraw notification consent',pending:'Open this link in the bot’s private chat. It expires in 5 minutes.',info:'Sharing a phone contact for OTP is not consent for booking notifications. Messages are sent only when the separate server notification worker is enabled.',error:'Could not load Telegram settings.',session:'Session changed. Sign in again.',confirm:'Unlink Telegram and withdraw consent?'},
};
export default function CustomerTelegramV190({ className = '' }) {
  const lang = readSiteLocale(useLocation().search);
  const ui = copy[lang] || copy.uz;
  const [state, setState] = useState(null);
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const task = useRef(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const invalidate = () => { task.current?.abort();task.current=null;setBusy(false);setState(null);setLink(null);setError(''); };
    const unsub = subscribeSession(invalidate);
    void run('status');
    return () => {alive.current=false;unsub();task.current?.abort();task.current=null;};
  }, []);
  async function run(action, enabled) {
    if (task.current) return;
    const auth = getSession();
    if (!auth?.token || auth.role !== 'customer') { setError(ui.session); return; }
    const controller = new AbortController();task.current = controller;
    setBusy(true);setError('');
    try {
      const kind = action === 'start' ? 'POST' : action === 'unlink' ? 'DELETE' : action === 'preferences' ? 'PATCH' : 'GET';
      const path = action === 'unlink' ? '/api/customers/telegram' : `/api/customers/telegram/${action}`;
      const result = await request(kind, path, {token:auth.token,signal:controller.signal,
        ...(action === 'preferences' ? {body:{notificationsEnabled:enabled}} : {})});
      const current = getSession();
      if (!alive.current || controller.signal.aborted || !sameCustomerSession(auth, current))
        return;
      if (action === 'start') {
        if (!safeCustomerTelegramLink(result?.deepLink) || result.expiresInSeconds!==300) throw new Error(ui.error);
        setLink(result.deepLink);
      } else {
        if (!validCustomerTelegramStatus(result)) throw new Error(ui.error);
        setState(result);
        if (result.linked || action === 'unlink') setLink(null);
      }
    } catch(cause){ if(alive.current&&!controller.signal.aborted) setError(cause.message || ui.error); }
    finally {if(task.current===controller){task.current=null;if(alive.current)setBusy(false);}}
  }
  return <section style={{padding:'12px 0'}} aria-label={ui.title} aria-busy={busy}>
    <h3>{ui.title}</h3><p>{ui.info}</p>
    <p role="status">{!state?ui.loading:state.linked?ui.linked:ui.unlinked}</p>
    {state?.linked ? <>
      <button type="button" className={className} disabled={busy} onClick={() => run('preferences',!state.notificationsEnabled)}>
        {state.notificationsEnabled?ui.disable:ui.enable}
      </button>
      <p>{state.notificationsEnabled?'✓ ':''}{state.notificationsEnabled?ui.enable:''}</p>
      <button type="button" className={className} disabled={busy} onClick={() => {if(window.confirm(ui.confirm)) void run('unlink');}}>{ui.disconnect}</button>
    </> : <button type="button" className={className} disabled={busy||!state} onClick={() => run('start')}>{ui.connect}</button>}
    {state?.linked&&<CustomerBookingNotificationHistoryV191/>}
    {link&&<div><p>{ui.pending}</p><a href={link} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{ui.open}</a></div>}
    <button type="button" className={className} disabled={busy} onClick={() => run('status')}>{ui.refresh}</button>
    {error&&<p role="alert" style={{color:'#fb7185'}}>{error}</p>}
  </section>;
}
