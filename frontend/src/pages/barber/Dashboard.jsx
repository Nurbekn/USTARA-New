import { Link } from "react-router-dom";
import BookingCard from "./components/BookingCard";
import Stars from "./components/Stars";
import { STATUS, getRatingSummary, toISODate, useBarber } from "./data/store";
import { bookingStart, formatMoney, greeting } from "./data/format";

// Home: what matters right now — next client, new requests, today's list
export default function Dashboard() {
  const { profile, bookings, reviews } = useBarber();
  const now = new Date();
  const today = toISODate(now);

  const todays = bookings
    .filter((b) => b.date === today && b.status !== STATUS.CANCELLED)
    .sort((a, b) => a.time.localeCompare(b.time));

  const earnedToday = todays
    .filter((b) => b.status === STATUS.COMPLETED)
    .reduce((sum, b) => sum + b.price, 0);

  // Requests the barber still has to answer (today and later)
  const requests = bookings
    .filter((b) => b.status === STATUS.PENDING && b.date >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  // First confirmed booking that has not started yet
  const next = bookings
    .filter((b) => b.status === STATUS.CONFIRMED && bookingStart(b) >= now)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];

  const { average, count } = getRatingSummary(reviews);

  return (
    <div className="bx-page">
      <header className="bx-hello">
        <p>{greeting(now)},</p>
        <h1>{profile.firstName}</h1>
      </header>

      {profile.services.length === 0 && (
        <Link to="/barber/services" className="bx-todo">
          <strong>Xizmat qo'shing</strong>
          <span>Mijozlar bron qila olishi uchun kamida bitta xizmat va narx kerak →</span>
        </Link>
      )}

      <div className="bx-stats">
        <Link to="/barber/earnings" className="bx-stat bx-stat-main">
          <span>Bugungi daromad</span>
          <strong>{formatMoney(earnedToday)}</strong>
          <small>Batafsil →</small>
        </Link>
        <Link to="/barber/reviews" className="bx-stat">
          <span>Reyting</span>
          <strong>{count ? average.toFixed(1) : "—"}</strong>
          <Stars value={average} size={12} />
        </Link>
      </div>

      {next && (
        <section className="bx-next">
          <span className="bx-eyebrow">Keyingi mijoz</span>
          <div>
            <strong>{next.time}</strong>
            <p>
              {next.customer} · {next.service}
            </p>
          </div>
          <a href={`tel:${next.phone}`} className="bx-btn bx-btn-sm bx-btn-primary">
            Qo'ng'iroq
          </a>
        </section>
      )}

      <section>
        <div className="bx-sec-title">
          <h2>
            Yangi so'rovlar {requests.length > 0 && <em>{requests.length}</em>}
          </h2>
          <Link to="/barber/bookings">Hammasi</Link>
        </div>
        {requests.length === 0 ? (
          <p className="bx-empty-line">Yangi so'rov yo'q</p>
        ) : (
          <div className="bx-list">
            {requests.slice(0, 3).map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="bx-sec-title">
          <h2>Bugungi bronlar</h2>
          <span className="bx-muted">{todays.length} ta</span>
        </div>
        {todays.length === 0 ? (
          <div className="bx-empty">
            <strong>Bugun bronlar yo'q</strong>
            <p>Portfolio'ga yangi ish qo'shing, mijozlar ko'proq keladi.</p>
            <Link to="/barber/portfolio" className="bx-btn bx-btn-primary">
              Ish qo'shish
            </Link>
          </div>
        ) : (
          <div className="bx-list">
            {todays.map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
