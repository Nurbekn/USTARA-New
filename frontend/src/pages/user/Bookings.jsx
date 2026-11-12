import PageLoading from "../../components/Loading";
import ArrowIcon from "../../components/ArrowIcon";
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useLocation, useOutletContext, useSearchParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import Icon from "../../components/Icon";
import { isValidLocation } from '../../components/locationSearch';
import BookingCard from './bookings/BookingCard';
import { STATUSES, barberName, canCancel, cancelCustomerBooking, dateLabel, known, loadCustomerBookings, money, nearestBooking, normalizeBookings, sortBookings, statusInfo, total, validateCancellation } from './bookings/model';
import './Bookings.css';
import { cancelDemoBooking, getDemoBookingsSnapshot, readDemoBookings, subscribeDemoBookings } from './bookings/demoBookingStore';

export default function Bookings({ loadBookings = loadCustomerBookings, cancelBooking = cancelCustomerBooking }) {
  const [params, setParams] = useSearchParams();
  const context = useOutletContext();
  const location = useLocation();
  const viewerId = context?.profile?.phone || context?.profile?.id || '';
  const bookingsBase = location.pathname.startsWith('/demo') ? '/demo/reservations' : '/user/bookings';
  const demoSnapshot = useSyncExternalStore(subscribeDemoBookings, getDemoBookingsSnapshot, () => null);
  const demoBookings = readDemoBookings(demoSnapshot).filter((booking) => booking.viewerId === viewerId);
  const [request, setRequest] = useState({ status: 'loading', bookings: [] });
  const [attempt, setAttempt] = useState(0);
  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef(null);
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

  const allBookings = [...request.bookings, ...demoBookings];
  const filter = ['all', 'upcoming', 'history', ...Object.keys(STATUSES)].includes(params.get('status')) ? params.get('status') : 'all';
  const view = ['history', 'completed', 'cancelled', 'rejected'].includes(filter) ? 'history' : filter === 'all' ? 'all' : 'upcoming';
  const selected = allBookings.find((b) => String(b.id) === params.get('booking'));
  const sorted = sortBookings(allBookings);
  const visible = sorted.filter((booking) => matchesFilter(booking, filter));
  const nearest = ['all', 'upcoming', 'confirmed'].includes(filter) ? nearestBooking(allBookings) : null;
  const remaining = nearest ? visible.filter((b) => String(b.id) !== String(nearest.id)) : visible;
  function update(patch) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => value == null ? next.delete(key) : next.set(key, value));
    setParams(next);
  }
  function detailUrl(id) { const next = new URLSearchParams(params); next.set('booking', id); return `${bookingsBase}?${next}`; }
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
      const response = cancelling.isDemo ? await cancelDemoBooking(cancelling.id, viewerId) : await cancelBooking(cancelling.id, { signal: controller.signal });
      const updated = validateCancellation(response, cancelling.id);
      if (controller.signal.aborted) return;
      setRequest((previous) => ({ ...previous, bookings: previous.bookings.map((b) => String(b.id) === String(updated.id) ? updated : b) }));
      setNotice(cancelling.isDemo ? 'Bron bekor qilindi. Bu vaqt yana bo‘sh.' : 'Bron bekor qilindi. Yangi bron uchun ustani tanlang.');
      dialog.current.close(); setCancelling(null);
    } catch (error) {
      if (!controller.signal.aborted) setActionError(error.message === 'Bekor qilish xizmati hali ulanmagan.' ? error.message : 'Bron bekor qilinmadi. Holatini tekshirib, qayta urinib ko‘ring.');
    } finally { if (!controller.signal.aborted) { action.current = null; setBusy(false); } }
  }
  const loading = request.status === 'loading';
  return <section className="ub-page" aria-busy={loading}>
    <header className="ub-heading"><h1>Bronlarim</h1><p>Kelgusi tashriflar va oldingi bronlaringiz.</p></header>
    <nav className="ub-view-tabs" aria-label="Bronlar bo‘limlari">
      {[['all', 'Barchasi'], ['upcoming', 'Kelgusi'], ['history', 'Tarix']].map(([key, label]) => <button type="button" key={key} aria-pressed={view === key} onClick={() => update({ status: key === 'all' ? null : key, booking: null })}>{label}<span>{allBookings.filter((booking) => matchesFilter(booking, key)).length}</span></button>)}
    </nav>
    {view === 'history' && !params.has('booking') && <div className="ub-history-filters" role="group" aria-label="Tarixdagi bron holati">
      {[['history', 'Hammasi'], ['completed', 'Bajarilgan'], ['cancelled', 'Bekor qilingan'], ['rejected', 'Rad etilgan']].map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => update({ status: key, booking: null })}>{label}</button>)}
    </div>}
    <p className="ub-notice" role="status">{notice}</p>
    {params.has('booking') && <Link className="ub-back" to={`${bookingsBase}${filter === 'all' ? '' : `?status=${filter}`}`}><ArrowIcon direction="left" /> Bronlarga qaytish</Link>}
    {loading ? <PageLoading label="Bronlar yuklanmoqda…" /> : request.status === 'error' ? <div className="ub-empty" role="alert"><h2>Bronlarni yuklab bo‘lmadi</h2><p>Internet aloqasini tekshiring va qayta urinib ko‘ring.</p><button type="button" className="ub-button ub-primary" onClick={retry}>Qayta urinish</button></div> : params.has('booking') ? selected ? <BookingDetails booking={selected} onCancel={askCancel} profileBase={bookingsBase.startsWith("/demo") ? "/demo" : "/user"} /> : <div className="ub-empty"><h2>Bron topilmadi</h2><p>Bron mavjud emas yoki sizning hisobingizga tegishli emas.</p></div> : <>
      {visible.length ? <div className="ub-rows" aria-label={view === 'history' ? 'Bronlar tarixi' : 'Bronlar ro‘yxati'}>{nearest && <BookingCard booking={nearest} detailUrl={detailUrl(nearest.id)} onCancel={askCancel} nearest />}{remaining.map((b) => <BookingCard key={b.id} booking={b} detailUrl={detailUrl(b.id)} onCancel={askCancel} />)}</div> : <div className="ub-empty"><span className="ub-empty-icon"><Icon name="scissors" size={30} /></span><h2>{allBookings.length ? 'Bu holatda bronlar yo‘q' : 'Birinchi tashrifingizni rejalashtiring'}</h2><p>{allBookings.length ? 'Boshqa holatni tanlang yoki barcha bronlarni ko‘ring.' : 'Ustani toping va qulay vaqtingizni band qiling. Bronlaringiz shu yerda ko‘rinadi.'}</p>{allBookings.length ? <button type="button" className="ub-button" onClick={() => update({status:null})}>Barcha bronlar</button> : <Link className="ub-button ub-primary" to="/user/explore">Barber topish<Icon name="arrow" size={18} /></Link>}</div>}
    </>}
    <dialog ref={dialog} className="ub-cancel-dialog" aria-labelledby="ub-cancel-title" aria-describedby="ub-cancel-description" onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <h2 id="ub-cancel-title">Bronni bekor qilasizmi?</h2><p id="ub-cancel-description">Bu amalni ortga qaytarib bo‘lmaydi. Keyingi tashrif uchun yangi bron qilish kerak bo‘ladi.</p>
      {cancelling && <div className="ub-cancel-summary"><strong>{barberName(cancelling)}</strong><span>{dateLabel(cancelling.startsAt, cancelling.timezone)} · {dateLabel(cancelling.startsAt, cancelling.timezone, true)}</span><p>{cancelling.isDemo ? 'Boshlanishidan oldin bepul bekor qilishingiz mumkin.' : cancelling.cancellationPolicy?.text || 'Bekor qilish qoidalari ko‘rsatilmagan.'}</p><span>Bekor qilish to‘lovi: {money(cancelling.cancellationPolicy?.fee)}</span></div>}
      {actionError && <p className="ub-action-error" role="alert">{actionError}</p>}
      <div className="ub-cancel-actions"><button type="button" className="ub-button" autoFocus disabled={busy} onClick={() => dialog.current.close()}>Ortga qaytish</button><button type="button" className="ub-button ub-danger" disabled={busy} onClick={confirmCancellation}>{busy ? 'Bekor qilinmoqda…' : 'Ha, bekor qilish'}</button></div>
    </dialog>
  </section>;
}

function BookingDetails({ booking, onCancel, profileBase }) {
  const b = booking;
  const location = b.salon?.location;
  const phone = /^\+?\d{7,15}$/.test(b.barber?.phone || '') ? b.barber.phone : null;
  const telegram = /^[a-zA-Z0-9_]{5,32}$/.test((b.barber?.telegram || '').replace(/^@/, '')) ? b.barber.telegram.replace(/^@/, '') : null;
  return <div className="ub-details">
    <BookingCard booking={b} onCancel={onCancel} detail />
    <section className="ub-panel" id="ub-services"><h2>Tanlangan xizmatlar</h2>{b.services.length ? <ul className="ub-service-list">{b.services.map((s,index) => <li key={s.id ?? index}><div><strong>{s.name || 'Xizmat nomi kiritilmagan'}</strong><span>{known(s.durationMinutes) ? `${s.durationMinutes} daqiqa` : 'Davomiyligi ko‘rsatilmagan'}</span></div><strong>{money(s.price)}</strong></li>)}</ul> : <p>Xizmatlar haqida ma’lumot yo‘q.</p>}<div className="ub-grand-total"><span>Umumiy to‘lov</span><strong>{money(total(b,'totalPrice','price'))}</strong></div></section>
    <section className="ub-panel"><h2>Barber va salon</h2><div className="ub-barber"><Avatar photo={b.barber?.avatarPhoto} id={b.barber?.avatar} name={barberName(b)} size={48} /><div><h3>{barberName(b)}</h3><p>{b.salon?.name || 'Salon nomi ko‘rsatilmagan'}</p></div></div><p className="ub-address"><Icon name="pin" size={18} />{b.salon?.address || 'Manzil ko‘rsatilmagan'}</p><div className="ub-contact-actions">{b.barber?.id != null && <Link className="ub-button" to={b.isDemo ? `${profileBase}/barbers/${encodeURIComponent(b.barber.id)}?demo=1` : `/user/explore?type=barbers&profile=${encodeURIComponent(b.barber.id)}`}>Barber profili</Link>}{isValidLocation(location) && <a className="ub-button" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=17/${location.lat}/${location.lng}`}>Xaritada ko‘rish</a>}{phone && <a className="ub-button" href={`tel:${phone}`}>Qo‘ng‘iroq qilish</a>}{telegram && <a className="ub-button" href={`https://t.me/${telegram}`} target="_blank" rel="noopener noreferrer">Telegram</a>}</div>{!phone && !telegram && <p className="ub-hint">Bog‘lanish ma’lumotlari ko‘rsatilmagan.</p>}</section>
    <section className="ub-panel"><h2>Holat tarixi</h2>{b.history.length ? <ol className="ub-history">{b.history.map((item,index) => <li key={index}><strong>{statusInfo(item.status).label}</strong><span>{dateLabel(item.at,b.timezone)} · {dateLabel(item.at,b.timezone,true)}</span>{item.note && !b.isDemo && <p>{item.note}</p>}</li>)}</ol> : <p>Holat tarixi hali taqdim etilmagan.</p>}{b.status === 'rejected' && b.rejectionReason && <p className="ub-rejection">Rad etish sababi: {b.rejectionReason}</p>}</section>
    <section className="ub-panel"><h2>Bekor qilish qoidalari</h2><p>{b.isDemo ? 'Boshlanishidan oldin bepul bekor qilishingiz mumkin.' : b.cancellationPolicy?.text || 'Bekor qilish qoidalari ko‘rsatilmagan.'}</p>{b.cancellationPolicy?.deadline && <p>Bekor qilish muddati: {dateLabel(b.cancellationPolicy.deadline,b.timezone)} · {dateLabel(b.cancellationPolicy.deadline,b.timezone,true)}</p>}<p>Bekor qilish to‘lovi: {money(b.cancellationPolicy?.fee)}</p>{!canCancel(b) && ['pending','confirmed'].includes(b.status) && <p className="ub-hint">Bu bronni onlayn bekor qilishga hozir ruxsat berilmagan.</p>}</section>
    {['cancelled','rejected','completed'].includes(b.status) && <Link className="ub-button ub-primary" to="/user/explore">Yangi bron uchun barber topish<Icon name="arrow" size={18} /></Link>}
  </div>;
}

function matchesFilter(booking, filter) {
  if (filter === 'all') return true;
  if (filter === 'upcoming') return ['pending', 'confirmed'].includes(booking.status);
  if (filter === 'history') return ['completed', 'cancelled', 'rejected'].includes(booking.status);
  return booking.status === filter;
}
