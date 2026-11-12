import { useState } from "react";
import BookingCard from "./components/BookingCard";
import PageHeader from "./components/PageHeader";
import { STATUS, useBarber } from "./data/store";
import { dateLabel } from "./data/format";

const PAGE_SIZE = 30;
const HISTORY = [STATUS.COMPLETED, STATUS.CANCELLED, STATUS.ABSENT];

// Groups an already sorted list by date: [["2026-10-31", [..]], ...]
function groupByDate(list) {
  const groups = [];
  for (const booking of list) {
    const last = groups[groups.length - 1];
    if (last && last[0] === booking.date) last[1].push(booking);
    else groups.push([booking.date, [booking]]);
  }
  return groups;
}

export default function Bookings() {
  const { bookings } = useBarber();
  const [tab, setTab] = useState(null); // null = pick a smart default
  const [visible, setVisible] = useState(PAGE_SIZE);

  const byTime = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
  const lists = {
    pending: bookings.filter((b) => b.status === STATUS.PENDING).sort(byTime),
    confirmed: bookings
      .filter((b) => b.status === STATUS.CONFIRMED)
      .sort(byTime),
    history: bookings
      .filter((b) => HISTORY.includes(b.status))
      .sort((a, b) => byTime(b, a)),
  };

  // Open on "Kutilmoqda" if there is something to answer
  const active = tab ?? (lists.pending.length ? "pending" : "confirmed");
  const list = lists[active];
  const shown = active === "history" ? list.slice(0, visible) : list;

  const tabs = [
    { id: "pending", label: "Kutilmoqda" },
    { id: "confirmed", label: "Tasdiqlangan" },
    { id: "history", label: "Tarix" },
  ];

  return (
    <div className="bx-page">
      <PageHeader title="Bronlar" subtitle="Mijozlar so'rovlari va tarix" />

      <div className="bx-seg" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            className={active === t.id ? "is-active" : ""}
            onClick={() => {
              setTab(t.id);
              setVisible(PAGE_SIZE);
            }}
          >
            {t.label}
            {t.id !== "history" && lists[t.id].length > 0 && (
              <em>{lists[t.id].length}</em>
            )}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="bx-empty">
          <strong>Bu yerda hozircha hech narsa yo'q</strong>
          <p>Yangi bronlar paydo bo'lganda Telegram orqali ham xabar olasiz.</p>
        </div>
      ) : (
        groupByDate(shown).map(([date, items]) => (
          <section key={date}>
            <h3 className="bx-day">{dateLabel(date)}</h3>
            <div className="bx-list">
              {items.map((b) => (
                <BookingCard key={b.id} booking={b} />
              ))}
            </div>
          </section>
        ))
      )}

      {active === "history" && list.length > visible && (
        <button
          type="button"
          className="bx-btn bx-btn-ghost bx-btn-block"
          onClick={() => setVisible(visible + PAGE_SIZE)}
        >
          Ko'proq ko'rsatish ({list.length - visible})
        </button>
      )}
    </div>
  );
}
