import { Link } from 'react-router-dom';
import { Avatar } from '../../../components/Avatar';
import Icon from '../../../components/Icon';
import { STATUSES, barberName, canCancel, dateLabel, known, money, statusInfo, total } from './model';

export default function BookingCard({ booking, detailUrl, onCancel, nearest = false, detail = false }) {
  const duration = total(booking, 'durationMinutes');
  const status = Object.hasOwn(STATUSES, booking.status) ? booking.status : 'unknown';
  const services = booking.services.map((service) => service.name).filter(Boolean).join(' · ');
  const amount = money(total(booking, 'totalPrice', 'price'));

  return (
    <article className={`ub-card ub-card-${status}${nearest ? ' ub-nearest' : ''}${detail ? '' : ' ub-card--summary'}`}>
      <div className="ub-card-top">
        <span className="ub-id">{nearest ? <><Icon name="calendar" size={16} /> Eng yaqin bron</> : 'Tashrif ma’lumoti'}</span>
        <span className={`ub-status ub-status-${status}`}>{statusInfo(status).label}</span>
      </div>
      <div className="ub-barber">
        <Avatar photo={booking.barber?.avatarPhoto} name={barberName(booking)} size={detail ? 48 : 40} />
        <div><h3>{barberName(booking)}</h3><p>{booking.salon?.name || 'Salon nomi ko‘rsatilmagan'}</p></div>
      </div>
      <p className="ub-services-summary"><Icon name="scissors" size={16} /><span>{services || 'Xizmatlar ko‘rsatilmagan'}</span></p>
      {detail ? (
        <>
          <dl className="ub-summary">
            <div><dt><Icon name="calendar" size={16} /> Sana</dt><dd>{dateLabel(booking.startsAt, booking.timezone)}</dd></div>
            <div><dt><Icon name="clock" size={16} /> Vaqt</dt><dd>{dateLabel(booking.startsAt, booking.timezone, true)}{known(duration) && <small> · {duration} daqiqa</small>}</dd></div>
          </dl>
          <p className="ub-address"><Icon name="pin" size={17} />{booking.salon?.address || 'Manzil ko‘rsatilmagan'}</p>
          <div className="ub-card-total"><span>Umumiy summa</span><strong>{amount}</strong></div>
          {canCancel(booking) && <div className="ub-card-actions"><button type="button" className="ub-button ub-danger-text" onClick={() => onCancel(booking)}>Bekor qilish</button></div>}
        </>
      ) : (
        <>
          <p className="ub-card-schedule"><Icon name="calendar" size={15} /><time dateTime={booking.startsAt}>{dateLabel(booking.startsAt, booking.timezone)}</time><strong>{dateLabel(booking.startsAt, booking.timezone, true)}</strong>{known(duration) && <span>· {duration} daqiqa</span>}</p>
          <div className="ub-card-footer"><strong>{amount}</strong><Link to={detailUrl}>Tafsilotlar<Icon name="arrow" size={16} /></Link></div>
        </>
      )}
    </article>
  );
}
