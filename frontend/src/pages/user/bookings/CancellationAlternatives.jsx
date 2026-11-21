import { customerActivityText } from '../customerActivityLocaleV148.js';
import { siteLocalePath } from '../../../utils/siteLocale.js';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadCancellationAlternatives } from './model';
import { alternativeBookingUrl, alternativeBarbersDiscoveryUrl } from './cancellationAlternatives';
import { getSession, subscribeSession } from '../../auth/utils/session';

// Informational only: selected times are never held or automatically booked.
export default function CancellationAlternatives({ booking, onClose, load = loadCancellationAlternatives, lang = 'uz' }) {
  const tr = customerActivityText(lang);
  const [request, setRequest] = useState({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const initial = getSession();
    const token = initial?.token;
    const profileId = initial?.profileId;
    if (!token || initial.role !== 'customer'
        || (booking.customer_id != null && profileId !== booking.customer_id)) {
      onClose();
      return;
    }
    return subscribeSession(() => {
      const current = getSession();
      if (!current || current.token !== token || current.profileId !== profileId) onClose();
    });
  }, [booking.customer_id]);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setRequest({ status: 'loading' });
    Promise.resolve().then(() => load(booking, { signal: controller.signal }))
      .then(data => { if (active) setRequest({ status: 'ready', ...data }); })
      .catch(error => { if (active) setRequest({ status: 'error', error }); });
    return () => { active = false; controller.abort(); };
  }, [booking, load, revision]);
  return <section className="ub-panel ub-alternatives" aria-label={tr("Bekor qilingan brondan keyingi muqobil vaqtlar")}>
    <div className="ub-alternatives-heading"><h2>{tr("Muqobil bo‘sh vaqtlar")}</h2>
      <button type="button" className="ub-button" onClick={onClose} aria-label={tr("Muqobil vaqtlarni yopish")}>{tr("Yopish")}</button></div>
    {request.status === 'loading' && <p role="status">{tr("Bo‘sh vaqtlar serverdan tekshirilmoqda…")}</p>}
    {request.status === 'error' && <p role="alert">{request.error?.code === 'session_changed' || request.error?.status === 401
      ? tr("Akkaunt sessiyasi o‘zgargan. Qayta tizimga kiring.") : tr("Bo‘sh vaqtlarni tekshirib bo‘lmadi. Qayta urinib ko‘ring.")}</p>}
    {request.status === 'ready' && (request.slots?.length
      ? <ul className="ub-alternative-times">{request.slots.map(slot => <li key={`${slot.date}/${slot.time}`}>
          <span>{slot.date} · {slot.time}</span>
        </li>)}</ul>
      : <p>{request.unavailable ? tr("Oldingi xizmatlar mavjud emas. Yangi bron uchun xizmatlarni qayta tanlang.")
        : tr("Tekshirilgan kunlarda mos bo‘sh vaqt topilmadi.")}</p>)}
    {request.partial && <p className="ub-hint">{tr("Ayrim kunlarni serverdan tekshirib bo‘lmadi.")}</p>}
    <p className="ub-hint">{tr("Vaqtlar hozircha bo‘sh, lekin band qilib qo‘yilmagan. Yangi bron qilishda vaqt va narx qayta tekshiriladi.")}</p>
    {alternativeBarbersDiscoveryUrl(booking) && <p className="ub-hint">{tr("Boshqa sartaroshlar faqat qidiruvda ko‘rsatiladi. Xizmat va bo‘sh vaqtni yangi bron qilishdan oldin tekshiring.")}</p>}
    <div className="ub-cancel-actions">
      <button type="button" className="ub-button" disabled={request.status === 'loading'} onClick={() => setRevision(n => n + 1)}>{tr("Vaqtlarni yangilash")}</button>
      <Link className="ub-button ub-primary" to={siteLocalePath(alternativeBookingUrl(booking), lang)}>{tr("Yangi bronni tanlash")}</Link>
      {alternativeBarbersDiscoveryUrl(booking) && <Link className="ub-button" to={siteLocalePath(alternativeBarbersDiscoveryUrl(booking), lang)}>{tr("Boshqa sartaroshlarni izlash")}</Link>}
    </div>
  </section>;
}
