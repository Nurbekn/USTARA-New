import {useState} from 'react';
import {toISODate} from '../data/store.js';
import {buildBookingTimeline,shiftTimelineDay,validTimelineDay} from '../data/bookingTimelineV160.js';
import {bookingTimelineText} from '../bookingTimelineLocaleV160.js';
import './booking-day-timeline-v160.css';

// Visualization only: booking changes still use the existing BookingCard actions.
export default function BookingDayTimelineV160({bookings,status,lang}) {
  const t = bookingTimelineText(lang);
  const [selectedDay,setSelectedDay] = useState(()=>toISODate());
  const validDay = validTimelineDay(selectedDay) ? selectedDay : toISODate();
  const previous = shiftTimelineDay(validDay,-1);
  const next = shiftTimelineDay(validDay,1);
  const timeline = status === 'ready' ? buildBookingTimeline(bookings,validDay) : null;
  const onDayChange = (event) => {
    if (validTimelineDay(event.target.value)) setSelectedDay(event.target.value);
  };
  return <section className="bx-card bx-booking-timeline" aria-labelledby="bx-timeline-title">
    <header className="bx-booking-timeline-header">
      <div><h2 id="bx-timeline-title">{t.title}</h2><p className="bx-muted">{t.description}</p></div>
      <span className="bx-booking-timeline-zone">Asia/Tashkent · UTC+5</span>
    </header>
    <div className="bx-booking-timeline-controls" role="group" aria-label={t.selectDate}>
      <button type="button" className="bx-btn bx-btn-ghost" aria-label={t.previous} disabled={!previous} onClick={()=>setSelectedDay(previous)}>‹</button>
      <label>{t.selectDate}<input type="date" value={validDay} min="2000-01-01" max="2100-12-31" onChange={onDayChange}/></label>
      <button type="button" className="bx-btn bx-btn-ghost" aria-label={t.next} disabled={!next} onClick={()=>setSelectedDay(next)}>›</button>
      <button type="button" className="bx-btn bx-btn-ghost" disabled={validDay===toISODate()} onClick={()=>setSelectedDay(toISODate())}>{t.today}</button>
    </div>
    {status === 'loading' ? <p role="status" className="bx-muted">…</p>
      : status !== 'ready' || !timeline?.sourceValid ? <p role="status" className="bx-error">{t.unavailable}</p>
      : <>
        <p className="bx-booking-timeline-count" aria-live="polite">{timeline.items.length} {t.count}</p>
        {timeline.invalidCount>0 && <p role="alert" className="bx-error">{t.invalid}</p>}
        {timeline.items.length===0 ? <p className="bx-muted">{t.noBookings}</p> :
          <ol className="bx-booking-timeline-list" aria-label={t.title}>{timeline.items.map(item =>
            <li key={item.id} className={`bx-booking-timeline-item is-${item.status}`}>
              <span className="bx-booking-timeline-hour"><time dateTime={`${validDay}T${item.startsAt}:00+05:00`}>{item.startsAt}</time><span className="bx-booking-timeline-end">{item.endsAt} {item.nextDay && t.nextDayMark}</span></span>
              <span className="bx-booking-timeline-dot" aria-hidden="true"/>
              <div className="bx-booking-timeline-event">
                <div className="bx-booking-timeline-event-title"><strong>{item.customer}</strong><span className="bx-booking-timeline-status">{t[item.status]}</span></div>
                <span className="bx-booking-timeline-service">{item.service}</span>
              </div>
            </li>)}</ol>}
        </>}
  </section>;
}
