import { formatDate, formatMoney } from "../../../utils/format";
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import Sheet from '../../../components/Sheet';
import ArrowIcon from '../../../components/ArrowIcon';
import Icon from "../../../components/Icon";
import { bookingDates, bookingTimestamp, createDemoBooking, dailySlots, getDemoBookingsSnapshot, readDemoBookings, subscribeDemoBookings, tashkentDate } from '../bookings/demoBookingStore';
import './InlineBooking.css';

const WEEKDAYS = ['Ya', 'Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sha'];

export default function InlineBooking({ barber, details, viewer, viewerId, bookingsPath }) {
  const snapshot = useSyncExternalStore(subscribeDemoBookings, getDemoBookingsSnapshot, () => null);
  const bookings = readDemoBookings(snapshot);
  const [now, setNow] = useState(Date.now);
  const dates = bookingDates(now);
  const [serviceIds, setServiceIds] = useState([]);
  const serviceIdsRef = useRef([]);
  const [date, setDate] = useState(() => bookingDates().find((day) => dailySlots({ barberId: barber.id, date: day, duration: (details.services[0]?.duration || 30) }).some((slot) => slot.available)) || bookingDates()[0]);
  const [time, setTime] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const saving = useRef(false);
  const services = details.services.filter((service) => serviceIds.includes(service.id));
  const duration = services.reduce((sum, service) => sum + service.duration, 0);
  const price = services.reduce((sum, service) => sum + service.price, 0);
  const slots = duration ? dailySlots({ barberId: barber.id, date, duration, bookings, now }) : [];
  const selected = slots.find((slot) => slot.time === time);
  const customerName = [viewer.firstName, viewer.lastName].filter(Boolean).join(' ') || viewer.name || 'Mijoz';

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  function chooseService(id) {
    const current = serviceIdsRef.current;
    const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
    serviceIdsRef.current = next;
    const nextDuration = details.services.filter((service) => next.includes(service.id)).reduce((sum, service) => sum + service.duration, 0);
    const hasTime = (day) => dailySlots({ barberId: barber.id, date: day, duration: nextDuration, bookings, now }).some((slot) => slot.available);
    setServiceIds(next);
    if (nextDuration && !hasTime(date)) setDate(dates.find(hasTime) || dates[0]);
    setTime(''); setError('');
  }

  async function confirm() {
    if (saving.current || !selected?.available || !services.length) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const booking = await createDemoBooking({ viewerId, customerName, barberId: barber.id, serviceIds, date, time });
      setSuccess(booking); setConfirmOpen(false);
    } catch (cause) {
      setError(cause.message || 'Buyurtma saqlanmadi. Qayta urinib ko‘ring.');
    } finally {
      saving.current = false; setBusy(false);
    }
  }

  if (success) return <div className="ib-success" role="status"><span className="ib-success-mark"><Icon name="check" size={28} /></span><h2>Buyurtma saqlandi</h2><p>{barber.name} · {formatDate(success.date)} · {success.time}–{success.endTime}</p><p>{success.services.map((service) => service.name).join(', ')} · {formatMoney(success.totalPrice)}</p><p className="ib-note">Bu sinov buyurtmasi. Haqiqiy ustaga yuborilmagan.</p><Link className="ib-primary" to={`${bookingsPath}?booking=${success.id}`}>Bronlarim <ArrowIcon /></Link><button type="button" className="ib-text" onClick={() => { setSuccess(null); setTime(''); setServiceIds([]); serviceIdsRef.current = []; }}>Yana vaqt tanlash</button></div>;

  return <div className="ib-booking">
    <header className="ib-heading"><h2><Icon name="socialScissors" size={20} />Xizmatni tanlang</h2><p>Bir nechta tanlash mumkin.</p></header>
    <div className="ib-services" role="group" aria-label="Xizmatlar">{details.services.map((service) => <button type="button" key={service.id} className="ib-service" aria-pressed={serviceIds.includes(service.id)} onClick={() => chooseService(service.id)}><span className="ib-check" aria-hidden="true">{serviceIds.includes(service.id) && <Icon name="check" size={16} />}</span><span className="ib-service-name"><strong>{service.name}</strong><small><Icon name="clock" size={13} />{service.duration} daqiqa</small></span><strong className="ib-price">{formatMoney(service.price)}</strong></button>)}</div>
    {services.length > 0 && <>
      <p className="ib-total">{services.length} ta xizmat · {duration} daqiqa <strong>{formatMoney(price)}</strong></p>
      <section className="ib-date-section" aria-labelledby="ib-date-title"><div className="ib-section-label"><h3 id="ib-date-title"><Icon name="socialCalendar" size={18} />Kun</h3><span>Toshkent vaqti</span></div><div className="ib-dates" role="group" aria-label="Keyingi 14 kun">{dates.map((day) => {
        const choices = dailySlots({ barberId: barber.id, date: day, duration, bookings, now });
        const dayName = WEEKDAYS[new Date(bookingTimestamp(day, '12:00')).getUTCDay()];
        return <button type="button" key={day} aria-pressed={date === day} disabled={!choices.length} aria-label={`${formatDate(day)} ${dayName}${!choices.length ? ', bo‘sh vaqt yo‘q' : ''}`} onClick={() => { setDate(day); setTime(''); setError(''); }}><span>{day === tashkentDate(now) ? 'Bugun' : dayName}</span><strong>{day.slice(8)}</strong><small>{day.slice(5, 7)}-oy</small></button>;
      })}</div></section>
      <section className="ib-times-section" aria-labelledby="ib-time-title"><div className="ib-section-label"><h3 id="ib-time-title"><Icon name="clock" size={18} />Bo‘sh vaqtlar</h3><span>{duration} daqiqa uchun</span></div><div className="ib-legend"><span>Bo‘sh vaqt</span><span>Band / vaqti o‘tgan</span></div>{slots.length && slots.some((slot) => slot.available) ? <div className="ib-slots" role="group" aria-label="Kunlik vaqtlar">{slots.map((slot) => <button type="button" key={slot.time} disabled={!slot.available} aria-pressed={time === slot.time} title={`${slot.time}–${slot.endTime} · ${slot.reason}`} onClick={() => { setTime(slot.time); setError(''); }}>{slot.time}</button>)}</div> : <p className="ib-no-slots">Bu kunda tanlangan xizmatlar uchun bo‘sh vaqt yo‘q. Boshqa kunni tanlang.</p>}</section>
      {time && !selected?.available && <p className="ib-error" role="alert">Tanlangan vaqt endi band yoki vaqti o‘tgan. Boshqa vaqtni belgilang.</p>}
      {selected?.available && <p className="ib-selection">Tanlandi: {formatDate(date)} · {time}–{selected.endTime}</p>}
      <button type="button" className="ib-primary" disabled={!selected?.available} onClick={() => { setError(''); setConfirmOpen(true); }}>Buyurtma berish <ArrowIcon /></button>
    </>}
    <Sheet open={confirmOpen} title="Buyurtmani tasdiqlash" onClose={() => { if (!saving.current) setConfirmOpen(false); }}>
      <div className="ib-confirm"><h3>{barber.name}</h3><p>{barber.salonName}</p><ul>{services.map((service) => <li key={service.id}>{service.name}<span>{service.duration} daqiqa</span></li>)}</ul><dl><div><dt>Sana</dt><dd>{formatDate(date)}</dd></div><div><dt>Vaqt</dt><dd>{time}–{selected?.endTime}</dd></div><div><dt>Davomiyligi</dt><dd>{duration} daqiqa</dd></div><div><dt>Umumiy narx</dt><dd>{formatMoney(price)}</dd></div><div><dt>To‘lov</dt><dd>Naqd</dd></div></dl><p className="ib-note">Buyurtma shu qurilmada saqlanadi. Ustaga yuborilmaydi.</p>{(!selected?.available || error) && <p className="ib-error" role="alert">{error || 'Bu vaqt band bo‘ldi. Boshqa vaqt tanlang.'}</p>}<button type="button" className="ib-primary" disabled={busy || !selected?.available} onClick={confirm}>{busy ? 'Saqlanmoqda…' : 'Buyurtmani tasdiqlash'}</button></div>
    </Sheet>
  </div>;
}
