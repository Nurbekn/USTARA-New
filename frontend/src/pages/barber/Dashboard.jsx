import { readSiteLocale, siteLocalePath } from "../../utils/siteLocale.js";
import { barberInsightsText } from "./barberInsightsLocaleV147.js";
import ArrowIcon from "../../components/ArrowIcon";
import { Link, useLocation } from "react-router-dom";
import BookingCard from "./components/BookingCard";
import PublicProfilePreviewCard from "./components/PublicProfilePreviewCard";
import Stars from "./components/Stars";
import { STATUS, getRatingSummary, toISODate, useBarber } from "./data/store";
import { bookingStart, formatMoney, greeting } from "./data/format";

// Home: what matters right now — next client, new requests, today's list
export default function Dashboard() {
  const lang=readSiteLocale(useLocation().search);
  const tr=barberInsightsText(lang);
  const { profile, bookings, reviews, posts, errors, status } = useBarber();
  const now = new Date();
  const today = toISODate(now);

  const todays = bookings
    .filter((b) => b.date === today && b.status !== STATUS.CANCELLED && b.status !== STATUS.REJECTED)
    .sort((a, b) => a.time.localeCompare(b.time));

  const completedToday = todays.filter((b) => b.status === STATUS.COMPLETED);
  const earningsAvailable = completedToday.every((booking) => typeof booking.price === "number" && Number.isFinite(booking.price));
  const earnedToday = earningsAvailable ? completedToday.reduce((sum, booking) => sum + booking.price, 0) : null;

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
        <p>{tr(greeting(now))},</p>
        <h1>{profile.firstName}</h1>
      </header>

      <PublicProfilePreviewCard profile={profile} status={status} posts={posts} errors={errors} compact />

      {profile.services.length === 0 && (
        <Link to={siteLocalePath('/barber/services',lang)} className="bx-todo">
          <strong>{tr("Birinchi xizmatni qo‘shish")}</strong>
          <span className="ui-arrow-inline">
            {tr("Mijozlar bron qila olishi uchun kamida bitta xizmat va narx kerak")}{" "}
            <ArrowIcon />
          </span>
        </Link>
      )}

      <nav className="bx-home-shortcuts" aria-label={tr("Tezkor o‘tish")}><Link to={siteLocalePath('/barber/schedule',lang)}>{tr("Ish jadvali")}</Link><Link to={siteLocalePath('/barber/services',lang)}>{tr("Xizmatlar")}</Link><Link to={siteLocalePath('/barber/bookings',lang)}>{tr("Bronlar")}</Link><Link to={siteLocalePath('/barber/queue',lang)}>{tr("Navbat")}</Link><Link to={siteLocalePath('/barber/portfolio',lang)}>{tr("Ishlarim")}</Link><Link to={siteLocalePath('/barber/profile',lang)}>{tr("Profil va Telegram")}</Link><Link to={siteLocalePath('/barber/chat',lang)}>{({uz:"Xabarlar",ru:"Сообщения",en:"Messages"})[lang]||"Xabarlar"}</Link></nav>
      {profile.services.length > 0 && <section><div className="bx-sec-title"><h2>{tr("Xizmatlar")}</h2><Link to={siteLocalePath('/barber/services',lang)}>{tr("Boshqarish")}</Link></div><div className="bx-home-services">{profile.services.slice(0, 4).map(service => <Link className="bx-home-service" key={service.id} to={siteLocalePath('/barber/services',lang)}><strong>{service.name}</strong><span>{formatMoney(service.price)} · {service.duration} {tr('daqiqa')}</span><small className={service.active ? 'bx-service-active' : 'bx-muted'}>{service.active ? tr('● Faol') : tr('Yashirilgan')}</small></Link>)}</div></section>}
      <div className="bx-stats">
        <Link to={siteLocalePath('/barber/earnings',lang)} className="bx-stat bx-stat-main">
          <span>{tr("Bugungi daromad")} {tr("(taxminiy)")}</span>
          <strong>{earnedToday == null ? tr('Mavjud emas') : formatMoney(earnedToday)}</strong>
          <small className="ui-arrow-inline">
            {tr("Batafsil")} <ArrowIcon />
          </small>
        </Link>
        <Link to={siteLocalePath('/barber/reviews',lang)} className="bx-stat">
          <span>{tr("Reyting")}</span>
          <strong>{count ? average.toFixed(1) : "—"}</strong>
          <Stars value={average} size={12} />
        </Link>
      </div>

      {next && (
        <section className="bx-next">
          <span className="bx-eyebrow">{tr("Keyingi mijoz")}</span>
          <div>
            <strong>{next.time}</strong>
            <p>
            {next.customer} · {next.service}
            </p>
          </div>
          {next.phone && <a href={`tel:${next.phone}`} className="bx-btn bx-btn-sm bx-btn-primary">{tr("Qo'ng'iroq")}</a>}
        </section>
      )}

      <section>
        <div className="bx-sec-title">
          <h2>
            {tr("Yangi so'rovlar")} {requests.length > 0 && <em>{requests.length}</em>}
          </h2>
          <Link to={siteLocalePath('/barber/bookings',lang)}>{tr("Hammasi")}</Link>
        </div>
        {requests.length === 0 ? (
          <p className="bx-empty-line">{tr("Yangi so'rov yo'q")}</p>
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
          <h2>{tr("Bugungi bronlar")}</h2>
          <span className="bx-muted">{tr('{count} ta',{count:todays.length})}</span>
        </div>
        {todays.length === 0 ? (
          <p className="bx-empty-line">{tr("Bugun bronlar yo‘q")}</p>
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
