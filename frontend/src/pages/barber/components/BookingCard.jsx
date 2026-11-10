import { useState } from "react";
import { Avatar } from "../../../components/Avatar";
import { STATUS, setBookingStatus } from "../data/store";
import { addMinutes, bookingStart, formatMoney } from "../data/format";

const STATUS_TEXT = {
  [STATUS.PENDING]: "Kutilmoqda",
  [STATUS.CONFIRMED]: "Tasdiqlangan",
  [STATUS.COMPLETED]: "Bajarilgan",
  [STATUS.CANCELLED]: "Bekor qilingan",
  [STATUS.ABSENT]: "Kelmadi",
};

// Actions that need a second tap ("Aniqmi?") because they cannot be undone
const NEEDS_CONFIRM = {
  [STATUS.CANCELLED]: "Bronni bekor qilasizmi?",
  [STATUS.ABSENT]: "Mijoz kelmadi deb belgilansinmi?",
};

export default function BookingCard({ booking, onChange }) {
  const [asking, setAsking] = useState(null); // status waiting for confirmation
  const started = bookingStart(booking) <= new Date();

  const apply = (status) => {
    setBookingStatus(booking.id, status);
    setAsking(null);
    onChange?.(status);
  };

  const request = (status) =>
    NEEDS_CONFIRM[status] ? setAsking(status) : apply(status);

  // Which buttons make sense for this status
  let actions = [];
  if (booking.status === STATUS.PENDING) {
    actions = [
      { status: STATUS.CONFIRMED, label: "Qabul qilish", kind: "primary" },
      { status: STATUS.CANCELLED, label: "Rad etish", kind: "ghost" },
    ];
  } else if (booking.status === STATUS.CONFIRMED) {
    actions = started
      ? [
          { status: STATUS.COMPLETED, label: "Bajarildi", kind: "ok" },
          { status: STATUS.ABSENT, label: "Kelmadi", kind: "danger" },
        ]
      : [{ status: STATUS.CANCELLED, label: "Bekor qilish", kind: "ghost" }];
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
              {booking.service} · {formatMoney(booking.price)}
            </span>
          </div>
          <span className={`bx-badge is-${booking.status}`}>
            {STATUS_TEXT[booking.status]}
          </span>
        </div>

        {(actions.length > 0 || booking.status === STATUS.CONFIRMED) && !asking && (
          <div className="bx-booking-actions">
            {actions.map((action) => (
              <button
                key={action.status}
                type="button"
                className={`bx-btn bx-btn-sm bx-btn-${action.kind}`}
                onClick={() => request(action.status)}
              >
                {action.label}
              </button>
            ))}
            <a className="bx-btn bx-btn-sm bx-btn-ghost" href={`tel:${booking.phone}`}>
              Qo'ng'iroq
            </a>
          </div>
        )}

        {asking && (
          <div className="bx-confirm" role="alert">
            <span>{NEEDS_CONFIRM[asking]}</span>
            <div>
              <button
                type="button"
                className="bx-btn bx-btn-sm bx-btn-danger"
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
      </div>
    </article>
  );
}
