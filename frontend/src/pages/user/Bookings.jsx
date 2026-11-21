import { customerActivityText } from './customerActivityLocaleV148.js';
import { readSiteLocale, siteLocalePath } from '../../utils/siteLocale.js';
import PageLoading from "../../components/Loading";
import ArrowIcon from "../../components/ArrowIcon";
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import Icon from "../../components/Icon";
import { barberPhone, bookingMapLinks } from './bookings/navigation.js';
import BookingCard from './bookings/BookingCard';
import CancellationAlternatives from './bookings/CancellationAlternatives';
import LateNoticeV169 from './bookings/LateNoticeV169';
import CheckInV170 from './bookings/CheckInV170';
import { requiresRescheduleReconciliation } from './bookings/rescheduleReconciliation.js';
import { alternativeBookingUrl, alternativeBarbersDiscoveryUrl } from './bookings/cancellationAlternatives.js';
import { STATUSES, barberName, canCancel, cancelCustomerBooking, dateLabel, known, loadCustomerBookings, loadCustomerBooking, loadRescheduleSlots, loadBookingServiceChoices, bookingServiceIds, money, nearestBooking, normalizeBookings, matchesBookingFilter, isOverdueBooking, rescheduleCustomerBooking, sortBookings, statusInfo, tashkentFields, total, validateCancellation } from './bookings/model';
import './Bookings.css';

export default function Bookings({ loadBookings = loadCustomerBookings, loadBooking = loadCustomerBooking, cancelBooking = cancelCustomerBooking }) {
  const [params, setParams] = useSearchParams();
  const lang = readSiteLocale(params);
  const tr = customerActivityText(lang);
  const bookingsBase = '/user/bookings';
  const [request, setRequest] = useState({ status: 'loading', bookings: [] });
  const [detailRequest, setDetailRequest] = useState({ status: 'loading' });
  const detailId = params.get('booking');
  const [attempt, setAttempt] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [cancelledForAlternatives, setCancelledForAlternatives] = useState(null);
  const dialog = useRef(null);
  const action = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.resolve().then(() => loadBookings({ signal: controller.signal })).then(normalizeBookings)
      .then((bookings) => { if (active) setRequest({ status: 'ready', bookings }); })
      .catch((error) => { if (active) setRequest({ status: 'error', bookings: [], error }); });
    return () => { active = false; controller.abort(); };
  }, [loadBookings, attempt]);
  useEffect(() => {
    if (detailId === null) return;
    const controller = new AbortController();
    let active = true;
    Promise.resolve().then(() => loadBooking(detailId, { signal: controller.signal }))
      .then((booking) => { if (active) setDetailRequest({ id: detailId, attempt, status: 'ready', booking }); })
      .catch((error) => { if (active) setDetailRequest({ id: detailId, attempt, status: error.status === 404 ? 'not_found' : 'error', error }); });
    return () => { active = false; controller.abort(); };
  }, [detailId, attempt, loadBooking]);
  useEffect(() => () => action.current?.abort(), []);

  const allBookings = request.bookings;
  const filter = ['all', 'upcoming', 'history', ...Object.keys(STATUSES)].includes(params.get('status')) ? params.get('status') : 'all';
  const view = ['history', 'completed', 'cancelled', 'rejected'].includes(filter) ? 'history' : filter === 'all' ? 'all' : 'upcoming';
  const detail = detailRequest.id === detailId && detailRequest.attempt === attempt ? detailRequest : { status: 'loading' };
  const selected = detail.status === 'ready' ? detail.booking : null;
  const sorted = sortBookings(allBookings);
  const visible = sorted.filter((booking) => matchesBookingFilter(booking, filter, clock));
  const nearest = ['all', 'upcoming', 'confirmed'].includes(filter) ? nearestBooking(visible, clock) : null;
  const remaining = nearest ? visible.filter((b) => String(b.id) !== String(nearest.id)) : visible;
  function update(patch) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => value == null ? next.delete(key) : next.set(key, value));
    setParams(next);
  }
  function detailUrl(id) { const next = new URLSearchParams(params); next.set('booking', id); return `${bookingsBase}?${next}`; }
  function retry() { setRequest({ status: 'loading', bookings: [] }); setAttempt((n) => n + 1); }
  function askCancel(booking) {
    if (!canCancel(booking, clock)) return;
    setCancelling(booking); setActionError(''); setCancelledForAlternatives(null); dialog.current.showModal();
  }
  async function confirmCancellation() {
    if (action.current || !cancelling) return;
    if (!canCancel(cancelling, Date.now())) { setActionError(tr('Bu bronni bekor qilish muddati tugagan. Ma’lumotlarni yangilang.')); return; }
    const controller = new AbortController(); action.current = controller; setBusy(true); setActionError('');
    try {
      const response = await cancelBooking(cancelling.id, { signal: controller.signal });
      const verifiedCancellation = validateCancellation(response, cancelling.id);
      if (controller.signal.aborted) return;
      setNotice(tr('Bron bekor qilindi. Muqobil bo‘sh vaqtlarni tekshirishingiz mumkin.'));
      setCancelledForAlternatives(verifiedCancellation);
      dialog.current.close(); setCancelling(null);
      retry();
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error.code === 'session_changed' ? tr("Akkaunt almashgan. Yangi hisobdagi bronlarni yangilang.")
          : error.status === 401 ? tr("Sessiya tugagan. Qayta tizimga kiring.")
          : error.status === 403 ? tr("Bu bronni bekor qilishga ruxsat berilmadi.")
            : error.status === 404 ? tr("Bron topilmadi yoki uni boshqarishga ruxsat yo‘q.")
              : error.status === 409 ? (error.code === 'cancellation_deadline_passed' ? error.message : tr("Bron holati o‘zgargan. Bronlar ro‘yxatini yangilang."))
                : error.status === 400 ? error.message
                  : error.message === 'Bekor qilish xizmati hali ulanmagan.' ? error.message
                    : tr("Bron bekor qilinmadi. Holatini tekshirib, qayta urinib ko‘ring.");
        setActionError(message);
      }
    } finally { if (!controller.signal.aborted) { action.current = null; setBusy(false); } }
  }
  const loading = request.status === 'loading' || (detailId !== null && detail.status === 'loading');
  const failed = request.status === 'error' || (detailId !== null && detail.status === 'error');
  const loadError = request.error || (detailId !== null ? detail.error : null);
  return <section className="ub-page" aria-busy={loading}>
    <header className="ub-heading"><h1>{tr("Bronlarim")}</h1><p>{tr("Kelgusi tashriflar va oldingi bronlaringiz.")} <Link to={siteLocalePath("/help?topic=bookings", lang)}>{tr("Bronlar bo‘yicha yordam")}</Link></p></header>
    <p><Link to={siteLocalePath("/user/queue", lang)}>{tr("QRsiz oddiy navbatim va Smart Booking takliflarim")}</Link></p>
    <nav className="ub-view-tabs" aria-label={tr("Bronlar bo‘limlari")}>
      {[['all', 'Barchasi'], ['upcoming', 'Kelgusi'], ['history', 'Tarix']].map(([key, label]) => <button type="button" key={key} aria-pressed={view === key} onClick={() => update({ status: key === 'all' ? null : key, booking: null })}>{tr(label)}<span>{allBookings.filter((booking) => matchesBookingFilter(booking, key, clock)).length}</span></button>)}
    </nav>
    {view === 'history' && !params.has('booking') && <div className="ub-history-filters" role="group" aria-label={tr("Tarixdagi bron holati")}>
      {[['history', 'Hammasi'], ['completed', 'Bajarilgan'], ['cancelled', 'Bekor qilingan'], ['rejected', 'Rad etilgan']].map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => update({ status: key, booking: null })}>{tr(label)}</button>)}
    </div>}
    <p className="ub-notice" role="status">{notice}</p>
    {cancelledForAlternatives && <CancellationAlternatives lang={lang} key={cancelledForAlternatives.id} booking={cancelledForAlternatives} onClose={() => setCancelledForAlternatives(null)} /> }
    {params.has('booking') && <Link className="ub-back" to={siteLocalePath(`${bookingsBase}${filter === 'all' ? '' : `?status=${filter}`}`, lang)}><ArrowIcon direction="left" /> {tr("Bronlarga qaytish")}</Link>}
    {loading ? <PageLoading label={tr("Bronlar yuklanmoqda…")} /> : failed ? <div className="ub-empty" role="alert"><h2>{tr("Bronlarni yuklab bo‘lmadi")}</h2><p>{loadError?.status === 401 ? tr("Qayta tizimga kiring.") : loadError?.status === 403 ? tr("Bronlarni ko‘rishga ruxsat berilmadi.") : loadError?.message || tr("Internet aloqasini tekshiring va qayta urinib ko‘ring.")}</p><button type="button" className="ub-button ub-primary" onClick={retry}>{tr("Qayta urinish")}</button></div> : params.has('booking') ? selected ? <BookingDetails lang={lang} booking={selected} onCancel={askCancel} onRescheduled={() => { setNotice(tr('Bron ma’lumotlari yangilandi.')); retry(); }} /> : <div className="ub-empty"><h2>{tr("Bron topilmadi")}</h2><p>{tr("Bron mavjud emas yoki sizning hisobingizga tegishli emas.")}</p></div> : <>
      {visible.length ? <div className="ub-rows" aria-label={view === 'history' ? tr('Bronlar tarixi') : tr('Bronlar ro‘yxati')}>{nearest && <BookingCard lang={lang} booking={nearest} detailUrl={detailUrl(nearest.id)} onCancel={askCancel} nearest />}{remaining.map((b) => <BookingCard lang={lang} key={b.id} booking={b} detailUrl={detailUrl(b.id)} onCancel={askCancel} />)}</div> : <div className="ub-empty"><span className="ub-empty-icon"><Icon name="scissors" size={30} /></span><h2>{allBookings.length ? tr("Bu holatda bronlar yo‘q") : tr("Birinchi tashrifingizni rejalashtiring")}</h2><p>{allBookings.length ? tr("Boshqa holatni tanlang yoki barcha bronlarni ko‘ring.") : tr("Ustani toping va qulay vaqtingizni band qiling. Bronlaringiz shu yerda ko‘rinadi.")}</p>{allBookings.length ? <button type="button" className="ub-button" onClick={() => update({status:null})}>{tr("Barcha bronlar")}</button> : <Link className="ub-button ub-primary" to={siteLocalePath("/user/explore", lang)}>{tr("Barber topish")}<Icon name="arrow" size={18} /></Link>}</div>}
    </>}
    <dialog ref={dialog} className="ub-cancel-dialog" aria-labelledby="ub-cancel-title" aria-describedby="ub-cancel-description" onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <h2 id="ub-cancel-title">{tr("Bronni bekor qilasizmi?")}</h2><p id="ub-cancel-description">{tr("Bu amalni ortga qaytarib bo‘lmaydi. Keyingi tashrif uchun yangi bron qilish kerak bo‘ladi.")}</p>
      {cancelling && <div className="ub-cancel-summary"><strong>{barberName(cancelling)}</strong><span>{dateLabel(cancelling.startsAt, cancelling.timezone)} · {dateLabel(cancelling.startsAt, cancelling.timezone, true)}</span><p>{cancelling.cancellationPolicy?.text || tr("Bekor qilish qoidalari ko‘rsatilmagan.")}</p><span>{tr("Bekor qilish to‘lovi:")} {money(cancelling.cancellationPolicy?.fee)}</span></div>}
      {actionError && <p className="ub-action-error" role="alert">{actionError}</p>}
      <div className="ub-cancel-actions"><button type="button" className="ub-button" autoFocus disabled={busy} onClick={() => dialog.current.close()}>{tr("Ortga qaytish")}</button><button type="button" className="ub-button ub-danger" disabled={busy} onClick={confirmCancellation}>{busy ? tr("Bekor qilinmoqda…") : tr("Ha, bekor qilish")}</button></div>
    </dialog>
  </section>;
}

function RescheduleForm({ booking, onSaved, lang = 'uz' }) {
  const tr = customerActivityText(lang);
  const current = tashkentFields(booking.startsAt);
  const originalIds = bookingServiceIds(booking);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(current.date);
  const [time, setTime] = useState(current.time);
  const [chosenIds, setChosenIds] = useState(originalIds);
  const [serviceRequest, setServiceRequest] = useState({ status: 'loading', services: [] });
  const [busy, setBusy] = useState(false);
  const [mustReload, setMustReload] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [slotRequest, setSlotRequest] = useState({ status: 'loading', date: null, slots: [] });
  const controllerRef = useRef(null);
  const savingRef = useRef(false);
  const changed = originalIds.join(',') !== chosenIds.join(',');
  const serviceKey = chosenIds.join(',');
  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); let active = true;
    Promise.resolve().then(() => loadBookingServiceChoices(booking, { signal: controller.signal }))
      .then(services => { if (active) setServiceRequest({ status:'ready', services }); })
      .catch(err => { if (active) setServiceRequest({ status:'error', services:[], error:err }); });
    return () => { active = false; controller.abort(); };
  }, [open, booking.barber?.id, revision]);
  useEffect(() => {
    if (!open || !chosenIds.length) return;
    const controller = new AbortController(); let active = true;
    Promise.resolve().then(() => loadRescheduleSlots(booking, date, {
      signal: controller.signal, serviceIds: changed ? chosenIds : null,
    })).then(data => { if (active) setSlotRequest({ status:'ready', date, key:`${serviceKey}:${revision}`, ...data }); })
      .catch(err => { if (active) setSlotRequest({ status:'error', date, key:`${serviceKey}:${revision}`, error:err, slots:[] }); });
    return () => { active = false; controller.abort(); };
  }, [open, date, booking.id, booking.startsAt, changed, serviceKey, revision]);
  const available = chosenIds.length && slotRequest.date === date && slotRequest.key === `${serviceKey}:${revision}`
    ? slotRequest : { status:'loading', slots:[] };
  const canChoose = !changed || (originalIds.length > 0 && serviceRequest.status === 'ready' && chosenIds.every(id =>
    serviceRequest.services.some(service => service.id === id)));
  const selectable = available.status === 'ready' && canChoose && available.slots.some(slot => slot.start === time);
  const hasChange = changed || date !== current.date || time !== current.time;
  const canSave = !mustReload && selectable && hasChange && (!changed || available.total_price != null);
  const minDate = tashkentFields(new Date().toISOString()).date;
  if (!['pending', 'confirmed'].includes(booking.status) || Date.parse(booking.startsAt) <= Date.now()) return null;

  function toggleService(id) {
    if (busy) return;
    setChosenIds(ids => ids.includes(id) ? ids.filter(value => value !== id)
      : ids.length < 20 ? [...ids, id] : ids);
    setError('');
  }
  async function save(event) {
    event.preventDefault();
    if (savingRef.current || busy || mustReload || !canSave) return;
    savingRef.current = true;
    const controller = new AbortController(); controllerRef.current = controller;
    setBusy(true); setError('');
    try {
      await rescheduleCustomerBooking(booking, date, time, {
        signal:controller.signal,
        serviceIds:changed ? chosenIds : null,
        quote:changed ? available.total_price : null,
      });
      if (!controller.signal.aborted) onSaved();
    } catch (err) {
      if (!controller.signal.aborted) {
        if (requiresRescheduleReconciliation(err)) setMustReload(true);
        setError(err.code === 'booking_confirmation_unknown'
          ? tr("Server javobi aniq emas. Bron o‘zgargan bo‘lishi mumkin: qayta yuborishdan oldin Bronlarimni yangilang.")
          : err.code === 'session_changed'
          ? tr("Akkaunt almashgan. Avval bronlarni qayta yuklang.")
          : err.code === 'price_changed'
          ? tr("Narx o‘zgardi. Yangi narxni ko‘rib, qayta tasdiqlang.")
          : err.code === 'booking_changed'
          ? tr("Bron boshqa qurilmada tahrirlangan. Eski bronni o‘zgartirmaslik uchun qayta yuklang.")
          : err.status === 409
          ? tr("Tanlangan vaqt band bo‘lishi yoki jadval o‘zgargan bo‘lishi mumkin. Bron saqlanib qoldi. Bo‘sh vaqtlarni yangilang.")
          : err.status === 401 ? tr("Sessiya tugagan. Qayta tizimga kiring.")
          : err.status === 0 ? tr("Ulanish uzildi. Bron o‘zgargan bo‘lishi mumkin. Avval Bronlarimni yangilang.")
          : err.message || tr("Bronni o‘zgartirib bo‘lmadi."));
        if (err.status === 409) { setRevision(value => value + 1); }
      }
    } finally {
      savingRef.current = false;
      if (controllerRef.current === controller) controllerRef.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return <section className="ub-panel ub-reschedule" aria-label={tr("Bronning vaqti va xizmatlarini o‘zgartirish")}>
    <h2>{tr("Bronni tahrirlash")}</h2>
    {!open ? <button type="button" className="ub-button" onClick={() => setOpen(true)}>{tr("Vaqt yoki xizmatlarni o‘zgartirish")}</button>
      : <form onSubmit={save}>
        <p className="ub-hint">{tr("Eski bron yangi vaqt va xizmatlar serverda tasdiqlanmaguncha saqlanadi. Narxni tekshiring — onlayn to‘lov olinmaydi.")}</p>
        <fieldset className="ub-edit-services" disabled={busy || serviceRequest.status !== 'ready'}>
          <legend>{tr("Xizmatlarni tanlang")}</legend>
          {serviceRequest.status === 'loading' && <p role="status">{tr("Xizmatlar yuklanmoqda…")}</p>}
          {serviceRequest.status === 'error' && <p role="alert" className="ub-action-error">{tr("Xizmatlar ro‘yxati yuklanmadi. Vaqtni ko‘chirish uchun eski xizmatlarni qoldirishingiz mumkin.")}</p>}
          {serviceRequest.services.map(item => <label key={item.id} className="ub-edit-service">
            <input type="checkbox" checked={chosenIds.includes(item.id)} disabled={busy || (chosenIds.length >= 20 && !chosenIds.includes(item.id))}
              onChange={() => toggleService(item.id)} />
            <span><strong>{item.name}</strong><small>{item.duration_minutes} {tr("daqiqa")} · {money(Number(item.price))}</small></span>
          </label>)}
          {booking.services.filter(item => item.id && !serviceRequest.services.some(service => service.id === item.id)).map(item =>
            <label key={item.id} className="ub-edit-service">
              <input type="checkbox" checked={chosenIds.includes(item.id)} disabled={busy} onChange={() => toggleService(item.id)} />
              <span><strong>{item.name || tr("Oldingi xizmat")}</strong><small>{tr("Hozir faol emas — o‘zgartirish uchun tanlovdan chiqaring")}</small></span>
            </label>)}
        </fieldset>
        {!chosenIds.length && <p role="alert" className="ub-action-error">{tr("Kamida bitta xizmat tanlang.")}</p>}
        {originalIds.length === 0 && <p role="alert" className="ub-action-error">{tr("Bu bronning xizmat ID’lari mavjud emas. Xizmatlarni onlayn tahrirlab bo‘lmaydi.")}</p>}
        <div className="ub-reschedule-fields">
          <label>{tr("Sana")}<input type="date" value={date} min={minDate} required disabled={busy} onChange={e => { setDate(e.target.value); setError(''); }} /></label>
          <label>{tr("Bo‘sh vaqtlar (5 daqiqa)")}
            <select value={available.slots.some(slot => slot.start === time) ? time : ''} required disabled={busy || available.status !== 'ready' || !canChoose}
              onChange={e => setTime(e.target.value)}>
              <option value="">{tr("Vaqtni tanlang")}</option>
              {available.slots.map(slot => <option key={slot.start} value={slot.start}>{slot.start}–{slot.end}</option>)}
            </select>
          </label>
        </div>
        {available.status === 'loading' && chosenIds.length > 0 && <p role="status" className="ub-hint">{tr("Yangi xizmat davomiyligiga mos bo‘sh vaqtlar tekshirilmoqda…")}</p>}
        {available.status === 'error' && <p role="alert" className="ub-action-error">{available.error?.message || tr("Jadvalni yuklab bo‘lmadi.")}</p>}
        {available.status === 'ready' && !available.slots.length && <p role="status" className="ub-hint">{tr("Bu sanada mos bo‘sh vaqt topilmadi.")}</p>}
        {changed && available.status === 'ready' && <div className="ub-edit-quote" role="status">
          <span>{tr("Yangi davomiylik:")} <strong>{available.duration} {tr("daqiqa")}</strong></span>
          <span>{tr("Oldingi bron narxi:")} <strong>{money(total(booking,'totalPrice','price'))}</strong></span>
          <span>{tr("Yangi jami narx (server hisoblagan):")} <strong>{money(Number(available.total_price))}</strong></span>
          <p className="ub-hint">{tr("Tasdiqlash orqali yangi xizmatlar va ko‘rsatilgan narxga rozilik bildirasiz.")}</p>
        </div>}
        {error && <p className="ub-action-error" role="alert">{error}</p>}
        {mustReload && <p role="alert" className="ub-action-error">{tr("Bronning haqiqiy holati qayta yuklanmaguncha yangi o‘zgartirish yuborilmaydi.")} <button type="button" className="ub-button" onClick={onSaved}>{tr("Bronlarimni yangilash")}</button></p>}
        <div className="ub-cancel-actions">
          <button type="button" className="ub-button" disabled={busy} onClick={() => { setError(''); setChosenIds(originalIds); setOpen(false); }}>{tr("Bekor qilish")}</button>
          <button type="submit" className="ub-button ub-primary" disabled={busy || !canSave}>{busy ? tr("Tekshirilmoqda…") : changed ? tr("Yangi xizmatlar va narxni tasdiqlash") : tr("Yangi vaqtni tasdiqlash")}</button>
        </div>
      </form>}
  </section>;
}
function BookingDetails({ booking, onCancel, onRescheduled, lang = 'uz' }) {
  const tr = customerActivityText(lang);
  const b = booking;
  const mapLinks = bookingMapLinks(b.salon?.location);
  const phone = barberPhone({barber_phone: b.barber?.phone});
  const telegram = /^[a-zA-Z0-9_]{5,32}$/.test((b.barber?.telegram || '').replace(/^@/, '')) ? b.barber.telegram.replace(/^@/, '') : null;
  return <div className="ub-details">
    <BookingCard lang={lang} booking={b} onCancel={onCancel} detail />
    {isOverdueBooking(b) && <p role="status" className="ub-hint">{tr("Bron vaqti o‘tgan, ammo serverdagi holati hali yangilanmagan. Tashrif yakunlangan deb hisoblamang — holatni tekshiring.")}</p>}
    <LateNoticeV169 key={b.id} booking={b} lang={lang} onSaved={onRescheduled} />
    <CheckInV170 key={`checkin-${b.id}`} booking={b} lang={lang} onSaved={onRescheduled} />
    <RescheduleForm lang={lang} booking={b} onSaved={onRescheduled} />
    <section className="ub-panel" id="ub-services"><h2>{tr("Tanlangan xizmatlar")}</h2>{b.services.length ? <ul className="ub-service-list">{b.services.map((s,index) => <li key={s.id ?? index}><div><strong>{s.name || tr("Xizmat nomi kiritilmagan")}</strong><span>{known(s.durationMinutes) ? `${s.durationMinutes} ${tr("daqiqa")}` : tr("Davomiyligi ko‘rsatilmagan")}</span></div><strong>{money(s.price)}</strong></li>)}</ul> : <p>{tr("Xizmatlar haqida ma’lumot yo‘q.")}</p>}<div className="ub-grand-total"><span>{tr("Umumiy to‘lov")}</span><strong>{money(total(b,'totalPrice','price'))}</strong></div></section>
    <section className="ub-panel"><h2>{tr("Barber va salon")}</h2><div className="ub-barber"><Avatar photo={b.barber?.avatarPhoto} id={b.barber?.avatar} name={barberName(b)} size={48} /><div><h3>{barberName(b)}</h3><p>{b.salon?.name || tr("Salon nomi ko‘rsatilmagan")}</p></div></div><p className="ub-address"><Icon name="pin" size={18} />{b.salon?.address || tr("Manzil ko‘rsatilmagan")}</p><div className="ub-contact-actions">{b.barber?.id != null && <Link className="ub-button" to={siteLocalePath(`/user/explore?type=barbers&profile=${encodeURIComponent(b.barber.id)}`, lang)}>{tr("Barber profili")}</Link>}{mapLinks.map(link => <a key={link.name} className="ub-button" target="_blank" rel="noopener noreferrer" href={link.href}>{link.name}</a>)}{phone && <a className="ub-button" href={`tel:${phone}`}>{tr("Qo‘ng‘iroq qilish")}</a>}{telegram && <a className="ub-button" href={`https://t.me/${telegram}`} target="_blank" rel="noopener noreferrer">Telegram</a>}</div>{!phone && !telegram && <p className="ub-hint">{tr("Bog‘lanish ma’lumotlari ko‘rsatilmagan.")}</p>}</section>
    <section className="ub-panel"><h2>{tr("Holat tarixi")}</h2>{b.history.length ? <ol className="ub-history">{b.history.map((item,index) => <li key={index}><strong>{tr(statusInfo(item.status).label)}</strong><span>{dateLabel(item.at,b.timezone)} · {dateLabel(item.at,b.timezone,true)}</span>{item.note && <p>{item.note}</p>}</li>)}</ol> : <p>{tr("Holat tarixi hali taqdim etilmagan.")}</p>}{b.status === 'rejected' && b.rejectionReason && <p className="ub-rejection">{tr("Rad etish sababi:")} {b.rejectionReason}</p>}</section>
    <section className="ub-panel"><h2>{tr("Bekor qilish qoidalari")}</h2><p>{b.cancellationPolicy?.text || tr("Bekor qilish qoidalari ko‘rsatilmagan.")}</p>{b.cancellationPolicy?.deadline && <p>{tr("Bekor qilish muddati:")} {dateLabel(b.cancellationPolicy.deadline,b.timezone)} · {dateLabel(b.cancellationPolicy.deadline,b.timezone,true)}</p>}<p>{tr("Bekor qilish to‘lovi:")} {money(b.cancellationPolicy?.fee)}</p>{!canCancel(b) && ['pending','confirmed'].includes(b.status) && <p className="ub-hint">{tr("Bu bronni onlayn bekor qilishga hozir ruxsat berilmagan.")}</p>}</section>
    {['cancelled','rejected','completed'].includes(b.status) && <Link className="ub-button ub-primary" to={siteLocalePath(alternativeBookingUrl(b), lang)}>{tr("Qayta bron qilish")}<Icon name="arrow" size={18} /></Link>}
    {alternativeBarbersDiscoveryUrl(b) && <p className="ub-hint"><Link className="ub-button" to={siteLocalePath(alternativeBarbersDiscoveryUrl(b), lang)}>{tr("Boshqa sartaroshlarni izlash")}</Link> {tr("Boshqa sartaroshlar faqat qidiruvda ko‘rsatiladi. Xizmat va bo‘sh vaqtni yangi bron qilishdan oldin tekshiring.")}</p>}
  </div>;
}

