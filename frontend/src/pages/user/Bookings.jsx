import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Avatar } from '../barber/data/avatars';
import HomeIcon from './HomeIcon';
import { isValidLocation } from '../../components/locationSearch';
import BookingCard from './bookings/BookingCard';
import { STATUSES, barberName, canCancel, cancelCustomerBooking, dateLabel, known, loadCustomerBookings, money, nearestBooking, normalizeBookings, sortBookings, statusInfo, timestamp, total, validateCancellation } from './bookings/model';
import './Bookings.css';

export default function Bookings({ loadBookings = loadCustomerBookings, cancelBooking = cancelCustomerBooking }) {
  const [params, setParams] = useSearchParams();
  const [request, setRequest] = useState({ status: 'loading', bookings: [] });
  const [attempt, setAttempt] = useState(0);
  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef(null);
  const filterMenu = useRef(null);
  useEffect(() => {
    const dismiss = (event) => { if (!filterMenu.current?.contains(event.target)) filterMenu.current?.removeAttribute('open'); };
    const escape = (event) => { if (event.key === 'Escape' && filterMenu.current?.open) { filterMenu.current.open=false;filterMenu.current.querySelector('summary')?.focus(); } };
    document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',escape);
    return () => {document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);};
  },[]);
  const action = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.resolve().then(() => loadBookings({ signal: controller.signal })).then(normalizeBookings)
      .then((bookings) => { if (active) setRequest({ status: 'ready', bookings }); })
      .catch(() => { if (active) setRequest({ status: 'error', bookings: [] }); });
    return () => { active = false; controller.abort(); };
  }, [loadBookings, attempt]);
  useEffect(() => () => action.current?.abort(), []);

  const filter = Object.hasOwn(STATUSES, params.get('status')) ? params.get('status') : 'all';
  const selected = request.bookings.find((b) => String(b.id) === params.get('booking'));
  const sorted = sortBookings(request.bookings);
  const visible = filter === 'all' ? sorted : sorted.filter((b) => b.status === filter);
  const nearest = ['all', 'confirmed'].includes(filter) ? nearestBooking(request.bookings) : null;
  const remaining = nearest ? visible.filter((b) => String(b.id) !== String(nearest.id)) : visible;
  function update(patch) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => value == null ? next.delete(key) : next.set(key, value));
    setParams(next);
  }
  function detailUrl(id) { const next = new URLSearchParams(params); next.set('booking', id); return `/user/bookings?${next}`; }
  function retry() { setRequest({ status: 'loading', bookings: [] }); setAttempt((n) => n + 1); }
  function askCancel(booking) {
    if (!canCancel(booking)) return;
    setCancelling(booking); setActionError(''); dialog.current.showModal();
  }
  async function confirmCancellation() {
    if (action.current || !cancelling) return;
    if (!canCancel(cancelling)) { setActionError('Bu bronni bekor qilish muddati tugagan. Ma’lumotlarni yangilang.'); return; }
    const controller = new AbortController(); action.current = controller; setBusy(true); setActionError('');
    try {
      const response = await cancelBooking(cancelling.id, { signal: controller.signal });
      const updated = validateCancellation(response, cancelling.id);
      if (controller.signal.aborted) return;
      setRequest((previous) => ({ ...previous, bookings: previous.bookings.map((b) => String(b.id) === String(updated.id) ? updated : b) }));
      setNotice('Bron bekor qilindi. Yangi bron uchun Explore orqali barberni tanlang.');
      dialog.current.close(); setCancelling(null);
    } catch (error) {
      if (!controller.signal.aborted) setActionError(error.message === 'Bekor qilish xizmati hali ulanmagan.' ? error.message : 'Bron bekor qilinmadi. Holatini tekshirib, qayta urinib ko‘ring.');
    } finally { if (!controller.signal.aborted) { action.current = null; setBusy(false); } }
  }
  const loading = request.status === 'loading';
  return <section className="ub-page" aria-busy={loading}>
    <header className="ub-heading ub-heading-with-filter"><div><h1>Bronlar</h1><p>Yaqinlashayotgan tashriflar va bronlaringiz tarixi.</p></div><details className="ub-filter-menu" ref={filterMenu} data-status={filter}><summary aria-label="Bron holatini tanlash"><span className="ub-filter-dot" aria-hidden="true"/><span>{filter === 'all' ? 'Hammasi' : statusInfo(filter).label}</span><span className="ub-filter-number">{loading ? '…' : request.status === 'error' ? '—' : visible.length}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div className="ub-filter-options" role="group" aria-label="Bron holatlari">{[['all',{label:'Hammasi'}],...Object.entries(STATUSES)].map(([key,value]) => <button type="button" key={key} className={`ub-filter-option ub-option-${key}`} aria-pressed={filter === key} onClick={() => {update({status:key === 'all' ? null : key,booking:null});filterMenu.current.open=false;}}><span className="ub-filter-dot" aria-hidden="true"/><span>{value.label}</span><span className="ub-filter-number">{request.status === 'ready' ? key === 'all' ? request.bookings.length : request.bookings.filter((b) => b.status===key).length : '—'}</span></button>)}</div></details></header>
    <p className="ub-notice" role="status">{notice}</p>
    {params.has('booking') && <Link className="ub-back" to={`/user/bookings${filter === 'all' ? '' : `?status=${filter}`}`}>← Bronlarga qaytish</Link>}
    {loading ? <div className="ub-loading" role="status"><p>Bronlar yuklanmoqda…</p><div className="ub-list" aria-hidden="true">{[0,1].map((n) => <div className="ub-skeleton" key={n}><i /><i /><i /></div>)}</div></div> : request.status === 'error' ? <div className="ub-empty" role="alert"><h2>Bronlarni yuklab bo‘lmadi</h2><p>Internet aloqasini tekshiring va qayta urinib ko‘ring.</p><button type="button" className="ub-button ub-primary" onClick={retry}>Qayta urinish</button></div> : params.has('booking') ? selected ? <BookingDetails booking={selected} onCancel={askCancel} /> : <div className="ub-empty"><h2>Bron topilmadi</h2><p>Bron mavjud emas yoki sizning hisobingizga tegishli emas.</p></div> : <>
      {visible.length ? <div className="ub-rows" aria-label={filter === 'all' ? 'Barcha bronlar' : statusInfo(filter).description}>{nearest && <BookingRow booking={nearest} href={detailUrl(nearest.id)} nearest />}{remaining.map((b) => <BookingRow key={b.id} booking={b} href={detailUrl(b.id)} />)}</div> : <div className="ub-empty"><span className="ub-empty-icon"><HomeIcon name="scissors" size={30} /></span><h2>{request.bookings.length ? 'Bu holatda bronlar yo‘q' : 'Birinchi tashrifingizni rejalashtiring'}</h2><p>{request.bookings.length ? 'Boshqa holatni tanlang yoki barcha bronlarni ko‘ring.' : 'Explore orqali barber va xizmatlarni toping. Bronlaringiz shu yerda ko‘rinadi.'}</p>{request.bookings.length ? <button type="button" className="ub-button" onClick={() => update({status:null})}>Barcha bronlar</button> : <Link className="ub-button ub-primary" to="/user/explore">Barber topish<HomeIcon name="arrow" size={18} /></Link>}</div>}
    </>}
    <dialog ref={dialog} className="ub-cancel-dialog" aria-labelledby="ub-cancel-title" aria-describedby="ub-cancel-description" onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <h2 id="ub-cancel-title">Bronni bekor qilasizmi?</h2><p id="ub-cancel-description">Bu amalni ortga qaytarib bo‘lmaydi. Keyingi tashrif uchun yangi bron qilish kerak bo‘ladi.</p>
      {cancelling && <div className="ub-cancel-summary"><strong>{barberName(cancelling)}</strong><span>{dateLabel(cancelling.startsAt, cancelling.timezone)} · {dateLabel(cancelling.startsAt, cancelling.timezone, true)}</span><p>{cancelling.cancellationPolicy?.text || 'Bekor qilish qoidalari ko‘rsatilmagan.'}</p><span>Bekor qilish to‘lovi: {money(cancelling.cancellationPolicy?.fee)}</span></div>}
      {actionError && <p className="ub-action-error" role="alert">{actionError}</p>}
      <div className="ub-cancel-actions"><button type="button" className="ub-button" autoFocus disabled={busy} onClick={() => dialog.current.close()}>Ortga qaytish</button><button type="button" className="ub-button ub-danger" disabled={busy} onClick={confirmCancellation}>{busy ? 'Bekor qilinmoqda…' : 'Ha, bekor qilish'}</button></div>
    </dialog>
  </section>;
}

function BookingDetails({ booking, onCancel }) {
  const b = booking;
  const location = b.salon?.location;
  const phone = /^\+?\d{7,15}$/.test(b.barber?.phone || '') ? b.barber.phone : null;
  const telegram = /^[a-zA-Z0-9_]{5,32}$/.test((b.barber?.telegram || '').replace(/^@/, '')) ? b.barber.telegram.replace(/^@/, '') : null;
  return <div className="ub-details">
    <BookingCard booking={b} onCancel={onCancel} detail />
    <section className="ub-panel" id="ub-services"><h2>Tanlangan xizmatlar</h2>{b.services.length ? <ul className="ub-service-list">{b.services.map((s,index) => <li key={s.id ?? index}><div><strong>{s.name || 'Xizmat nomi kiritilmagan'}</strong><span>{known(s.durationMinutes) ? `${s.durationMinutes} daqiqa` : 'Davomiyligi ko‘rsatilmagan'}</span></div><strong>{money(s.price)}</strong></li>)}</ul> : <p>Xizmatlar haqida ma’lumot yo‘q.</p>}<div className="ub-grand-total"><span>Umumiy to‘lov</span><strong>{money(total(b,'totalPrice','price'))}</strong></div></section>
    <section className="ub-panel"><h2>Barber va salon</h2><div className="ub-barber"><Avatar photo={b.barber?.avatarPhoto} id={b.barber?.avatar} name={barberName(b)} size={48} /><div><h3>{barberName(b)}</h3><p>{b.salon?.name || 'Salon nomi ko‘rsatilmagan'}</p></div></div><p className="ub-address"><HomeIcon name="pin" size={18} />{b.salon?.address || 'Manzil ko‘rsatilmagan'}</p><div className="ub-contact-actions">{b.barber?.id != null && <Link className="ub-button" to={`/user/explore?type=barbers&profile=${encodeURIComponent(b.barber.id)}`}>Barber profili</Link>}{isValidLocation(location) && <a className="ub-button" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=17/${location.lat}/${location.lng}`}>Xaritada ko‘rish</a>}{phone && <a className="ub-button" href={`tel:${phone}`}>Qo‘ng‘iroq qilish</a>}{telegram && <a className="ub-button" href={`https://t.me/${telegram}`} target="_blank" rel="noopener noreferrer">Telegram</a>}</div>{!phone && !telegram && <p className="ub-hint">Bog‘lanish ma’lumotlari ko‘rsatilmagan.</p>}</section>
    <section className="ub-panel"><h2>Holat tarixi</h2>{b.history.length ? <ol className="ub-history">{b.history.map((item,index) => <li key={index}><strong>{statusInfo(item.status).label}</strong><span>{dateLabel(item.at,b.timezone)} · {dateLabel(item.at,b.timezone,true)}</span>{item.note && <p>{item.note}</p>}</li>)}</ol> : <p>Holat tarixi hali taqdim etilmagan.</p>}{b.status === 'rejected' && b.rejectionReason && <p className="ub-rejection">Rad etish sababi: {b.rejectionReason}</p>}</section>
    <section className="ub-panel"><h2>Bekor qilish qoidalari</h2><p>{b.cancellationPolicy?.text || 'Bekor qilish qoidalari ko‘rsatilmagan.'}</p>{b.cancellationPolicy?.deadline && <p>Bekor qilish muddati: {dateLabel(b.cancellationPolicy.deadline,b.timezone)} · {dateLabel(b.cancellationPolicy.deadline,b.timezone,true)}</p>}<p>Bekor qilish to‘lovi: {money(b.cancellationPolicy?.fee)}</p>{!canCancel(b) && ['pending','confirmed'].includes(b.status) && <p className="ub-hint">Bu bronni onlayn bekor qilishga hozir ruxsat berilmagan.</p>}</section>
    {['cancelled','rejected','completed'].includes(b.status) && <Link className="ub-button ub-primary" to="/user/explore">Yangi bron uchun barber topish<HomeIcon name="arrow" size={18} /></Link>}
  </div>;
}

function BookingRow({booking:b,href,nearest=false}) {
  let day='—',month='';
  if (timestamp(b.startsAt)!=null) {
    let timezone=b.timezone || 'Asia/Tashkent';
    try { new Intl.DateTimeFormat('uz-UZ',{timeZone:timezone}); } catch {timezone='Asia/Tashkent';}
    day=new Intl.DateTimeFormat('uz-UZ',{day:'2-digit',timeZone:timezone}).format(new Date(b.startsAt));
    month=new Intl.DateTimeFormat('uz-UZ',{month:'short',timeZone:timezone}).format(new Date(b.startsAt));
  }
  return <Link to={href} className={`ub-booking-row ${nearest ? 'ub-row-nearest' : ''}`}><span className="ub-row-date"><strong>{day}</strong><span>{month}</span></span><span className="ub-row-body"><strong>{barberName(b)}</strong><span>{b.salon?.name || b.salon?.address || 'Salon ko‘rsatilmagan'} · {dateLabel(b.startsAt,b.timezone,true)}</span>{b.services.length>0 && <span>{b.services.map((s) => s.name).filter(Boolean).join(', ')}</span>}{nearest && <small>Eng yaqin bron</small>}</span><span className={`ub-row-status ub-status-${Object.hasOwn(STATUSES,b.status)?b.status:'unknown'}`}><span className="ub-row-status-dot"/>{statusInfo(b.status).label}</span><span className="ub-row-arrow" aria-hidden="true">›</span></Link>;
}
