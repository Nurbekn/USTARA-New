import { useLocation } from "react-router-dom";
import { readSiteLocale } from "../../../utils/siteLocale.js";
import { barberInsightsText } from "../barberInsightsLocaleV147.js";
import { useEffect, useState } from "react";
import { Avatar } from "../../../components/Avatar";
import { STATUS, setBookingStatus, refreshBarberData } from "../data/store";
import { mutateCheckIn } from "../../user/bookings/checkInV170.js";
import { addMinutes, bookingStart, formatMoney } from "../data/format";
import { lateNoticeUi } from "../../user/bookings/lateNoticeV169.js";
import BookingPrivateNoteV182 from "./BookingPrivateNoteV182.jsx";

const STATUS_TEXT = {
  [STATUS.PENDING]: "Kutilmoqda",
  [STATUS.CONFIRMED]: "Tasdiqlangan",
  [STATUS.COMPLETED]: "Bajarilgan",
  [STATUS.CANCELLED]: "Bekor qilingan",
  [STATUS.REJECTED]: "Rad etilgan",
};

// Actions that need a second tap ("Aniqmi?") because they cannot be undone
const NEEDS_CONFIRM = {
  [STATUS.CANCELLED]: "Bronni bekor qilasizmi?",
  [STATUS.REJECTED]: "Bron rad etilsinmi?",
  [STATUS.COMPLETED]: "Haqiqatan xizmatni tugatmoqchimisiz?",
};

export default function BookingCard({ booking, onChange }) {
  const lang=readSiteLocale(useLocation().search);
  const tr=barberInsightsText(lang);
  const [now, setNow] = useState(Date.now);
  const [asking, setAsking] = useState(null); // status waiting for confirmation
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkInReload, setCheckInReload] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const startedAt = booking.bookingTime ? new Date(booking.bookingTime) : bookingStart(booking);
  const ended = Number.isFinite(startedAt.getTime())
    && startedAt.getTime() + booking.duration * 60_000 <= now;

  const apply = async (status) => {
    setBusy(true); setError("");
    try {
      await setBookingStatus(booking.id, status);
      setAsking(null);
      onChange?.(status);
    } catch (cause) { setError(cause.message || tr("Bron holati serverda yangilanmadi.")); }
    finally { setBusy(false); }
  };

  const confirmArrival = async () => {
    if (busy || checkInReload || booking.status !== STATUS.CONFIRMED || !booking.checkIn || booking.checkIn.confirmedAt) return;
    setBusy(true);setError("");
    try {
      await mutateCheckIn(booking.id,"barber");
      setCheckInReload(true);
      await refreshBarberData();
    } catch (err) {
      setError(err.message || "Kelganlik tasdig‘i holati noma’lum. Bronlarni yangilang.");
      setCheckInReload(true);
    } finally {setBusy(false);}
  };

  const request = (status) =>
    NEEDS_CONFIRM[status] ? setAsking(status) : apply(status);

  // Which buttons make sense for this status
  let actions = [];
  if (booking.status === STATUS.PENDING) {
    actions = [
      { status: STATUS.CONFIRMED, label: tr("Qabul qilish"), kind: "primary" },
      { status: STATUS.REJECTED, label: tr("Rad etish"), kind: "ghost" },
    ];
  } else if (booking.status === STATUS.CONFIRMED) {
    actions = ended
      ? [
          { status: STATUS.COMPLETED, label: tr("Bajarildi"), kind: "ok" },
        ]
      : [{ status: STATUS.CANCELLED, label: tr("Bekor qilish"), kind: "ghost" }];
  }

  return (
    <article className={`bx-booking is-${booking.status}`}>
      <div className="bx-booking-time">
        <strong>{booking.time}</strong>
        <span>{addMinutes(booking.time, booking.duration)}</span>
      </div>

      <div className="bx-booking-body">
        <div className="bx-booking-top">
          <Avatar name={booking.customer} size={36} />
          <div className="bx-booking-who">
            <strong>{booking.customer}</strong>
            <span>
              {booking.service}{typeof booking.price === "number" && Number.isFinite(booking.price) ? ` · ${formatMoney(booking.price)}` : " · " + tr("Narx mavjud emas")}
            </span>
          </div>
          <span className={`bx-badge is-${booking.status}`}>
            {tr(STATUS_TEXT[booking.status] || booking.status)}
          </span>
        </div>

        {booking.checkIn && <div className="bx-late-notice" role="status">
          <strong>{lang === 'ru' ? 'Прибытие:' : lang === 'en' ? 'Check-in:' : 'Kelganlik:'}</strong>{' '}
          {booking.checkIn.confirmedAt
            ? (lang === 'ru' ? 'Подтверждено мастером' : lang === 'en' ? 'Confirmed by barber' : 'Sartarosh tasdiqladi')
            : (lang === 'ru' ? 'Ожидает подтверждения' : lang === 'en' ? 'Waiting for confirmation' : 'Tasdiq kutilmoqda')}
          {!booking.checkIn.confirmedAt && booking.status === STATUS.CONFIRMED &&
            <div><button type="button" className="bx-btn bx-btn-sm bx-btn-primary" disabled={busy || checkInReload}
              onClick={confirmArrival}>{lang === 'ru' ? 'Подтвердить прибытие' : lang === 'en' ? 'Confirm arrival' : 'Kelganini tasdiqlash'}</button></div>}
          {checkInReload && <button type="button" className="bx-btn bx-btn-sm bx-btn-ghost"
              onClick={() => refreshBarberData()}>{lang === 'ru' ? 'Обновить' : lang === 'en' ? 'Refresh' : 'Yangilash'}</button>}
        </div>}
        {booking.lateNotice && <p className="bx-late-notice" role="status"><strong>{lateNoticeUi(lang).customer}:</strong> +{booking.lateNotice.minutes} min. {lateNoticeUi(lang).notConfirmed}</p>}

        {(actions.length > 0 || booking.status === STATUS.CONFIRMED) && !asking && (
          <div className="bx-booking-actions">
            {actions.map((action) => (
              <button
                key={action.status}
                type="button"
                className={`bx-btn bx-btn-sm bx-btn-${action.kind}`}
                disabled={busy}
                onClick={() => request(action.status)}
              >
                {action.label}
              </button>
            ))}
            {/^[+\d]{7,16}$/.test(booking.phone || "") && <a className="bx-btn bx-btn-sm bx-btn-ghost" href={`tel:${booking.phone}`}>{tr("Qo‘ng‘iroq")}</a>}
          </div>
        )}

        {asking && (
          <div className="bx-confirm" role="alert">
            <span>{tr(NEEDS_CONFIRM[asking])}</span>
            <div>
              <button
                type="button"
                className="bx-btn bx-btn-sm bx-btn-danger"
                disabled={busy}
                onClick={() => apply(asking)}
              >
                Ha
              </button>
              <button
                type="button"
                className="bx-btn bx-btn-sm bx-btn-ghost"
                onClick={() => setAsking(null)}
              >
                Yo'q
              </button>
            </div>
          </div>
        )}
        <BookingPrivateNoteV182 bookingId={booking.id} lang={lang} />
        {error && <p className="bx-error" role="alert">{error}</p>}
      </div>
    </article>
  );
}
