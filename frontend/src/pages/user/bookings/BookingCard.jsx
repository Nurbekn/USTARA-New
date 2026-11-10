import { Link } from 'react-router-dom';
import { Avatar } from '../../../components/Avatar';
import UserIcon from '../components/UserIcon';
import { STATUSES, barberName, canCancel, dateLabel, known, money, statusInfo, total } from './model';

export default function BookingCard({ booking, detailUrl, onCancel, nearest = false, detail = false }) {
  const duration = total(booking, 'durationMinutes');
  return <article className={`ub-card ${nearest ? 'ub-nearest' : ''}`}>
    <div className="ub-card-top">{nearest ? <span className="ub-next-label">Eng yaqin bron</span> : <span className="ub-id">{booking.isDemo ? "Namuna buyurtma" : `Bron #${booking.id}`}</span>}<span className={`ub-status ub-status-${Object.hasOwn(STATUSES,booking.status) ? booking.status : 'unknown'}`}>{statusInfo(booking.status).label}</span></div>
    <div className="ub-barber"><Avatar photo={booking.barber?.avatarPhoto} id={booking.barber?.avatar} name={barberName(booking)} size={52} /><div><h3>{barberName(booking)}</h3><p>{booking.salon?.name || 'Salon nomi ko‘rsatilmagan'}</p></div></div>
    <p className="ub-address"><UserIcon name="pin" size={17} />{booking.salon?.address || 'Manzil ko‘rsatilmagan'}</p>
    <div className="ub-services-summary">{booking.services.length ? booking.services.map((s) => s.name).filter(Boolean).join(', ') || 'Xizmat nomi ko‘rsatilmagan' : 'Xizmatlar ko‘rsatilmagan'}</div>
    <dl className="ub-summary"><div><dt>Sana</dt><dd>{dateLabel(booking.startsAt, booking.timezone)}</dd></div><div><dt>Vaqt</dt><dd>{dateLabel(booking.startsAt, booking.timezone, true)}</dd></div><div><dt>Davomiyligi</dt><dd>{known(duration) ? `${duration} daqiqa` : 'Ko‘rsatilmagan'}</dd></div><div><dt>Umumiy summa</dt><dd>{money(total(booking, 'totalPrice', 'price'))}</dd></div></dl>
    <div className="ub-card-actions">{!detail && <Link to={detailUrl} className="ub-button ub-primary">Bron tafsilotlari<UserIcon name="arrow" size={17} /></Link>}{canCancel(booking) && <button type="button" className="ub-button ub-danger-text" onClick={() => onCancel(booking)}>Bekor qilish</button>}</div>
  </article>;
}
