import { useState } from "react";
import PageHeader from "./components/PageHeader";
import { STATUS, addDays, toISODate, useBarber } from "./data/store";
import {
  SHORT_MONTHS, SHORT_WEEKDAYS, formatMoney, groupDigits, shortMoney,
} from "./data/format";

const VIEWS = [
  { id: "day", label: "Kunlik" },
  { id: "week", label: "Haftalik" },
  { id: "year", label: "Yillik" },
];

// Sums price of completed bookings between two ISO dates (inclusive).
// ISO dates compare correctly as plain strings.
const inRange = (list, from, to) => list.filter((b) => b.date >= from && b.date <= to);
const sum = (list) => list.reduce((total, b) => total + b.price, 0);

// Builds the chart buckets + the "current" and "previous" period for a view
function buildReport(view, done) {
  const now = new Date();
  const buckets = [];
  let current;
  let previous;
  let periodName;

  if (view === "day") {
    // Last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = addDays(-i, now);
      const iso = toISODate(d);
      buckets.push({ label: SHORT_WEEKDAYS[d.getDay()], from: iso, to: iso });
    }
    current = buckets[6];
    previous = buckets[5];
    periodName = "Bugun";
  } else if (view === "week") {
    // Last 8 weeks, Monday–Sunday
    const toMonday = now.getDay() === 0 ? -6 : 1 - now.getDay();
    for (let k = -7; k <= 0; k++) {
      const start = addDays(toMonday + k * 7, now);
      const end = addDays(toMonday + k * 7 + 6, now);
      buckets.push({
        label: `${start.getDate()}.${String(start.getMonth() + 1).padStart(2, "0")}`,
        from: toISODate(start),
        to: toISODate(end),
      });
    }
    current = buckets[7];
    previous = buckets[6];
    periodName = "Shu hafta";
  } else {
    // Last 12 months
    for (let m = -11; m <= 0; m++) {
      const first = new Date(now.getFullYear(), now.getMonth() + m, 1);
      const last = new Date(now.getFullYear(), now.getMonth() + m + 1, 0);
      buckets.push({ label: SHORT_MONTHS[first.getMonth()], from: toISODate(first), to: toISODate(last) });
    }
    current = { from: buckets[0].from, to: buckets[11].to };
    const prevFirst = new Date(now.getFullYear() - 1, now.getMonth() - 11, 1);
    const prevLast = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0);
    previous = { from: toISODate(prevFirst), to: toISODate(prevLast) };
    periodName = "Oxirgi 12 oy";
  }

  const withValue = buckets.map((b) => ({ ...b, value: sum(inRange(done, b.from, b.to)) }));
  const currentList = inRange(done, current.from, current.to);
  const previousTotal = sum(inRange(done, previous.from, previous.to));

  return {
    buckets: withValue,
    periodName,
    list: currentList,
    total: sum(currentList),
    previousTotal,
  };
}

export default function Earnings() {
  const { bookings } = useBarber();
  const [view, setView] = useState("day");
  const [picked, setPicked] = useState(null); // tapped bar index

  const done = bookings.filter((b) => b.status === STATUS.COMPLETED);
  const report = buildReport(view, done);

  const selected = picked ?? (view === "year" ? null : report.buckets.length - 1);
  const max = Math.max(...report.buckets.map((b) => b.value), 1);

  // Change vs previous period (hidden when there is nothing to compare)
  const change = report.previousTotal
    ? Math.round(((report.total - report.previousTotal) / report.previousTotal) * 100)
    : null;

  // Income per service in the current period
  const byService = Object.values(
    report.list.reduce((acc, b) => {
      acc[b.service] ??= { name: b.service, count: 0, total: 0 };
      acc[b.service].count += 1;
      acc[b.service].total += b.price;
      return acc;
    }, {}),
  ).sort((a, b) => b.total - a.total);

  const average = report.list.length ? report.total / report.list.length : 0;

  return (
    <div className="bx-page">
      <PageHeader back title="Daromad" subtitle="Faqat bajarilgan bronlar hisoblanadi" />

      <div className="bx-seg" role="tablist">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            className={view === v.id ? "is-active" : ""}
            onClick={() => {
              setView(v.id);
              setPicked(null);
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      <section className="bx-card bx-earn-main">
        <span className="bx-eyebrow">{report.periodName}</span>
        <strong>{formatMoney(report.total)}</strong>
        {change !== null && (
          <span className={`bx-change ${change >= 0 ? "up" : "down"}`}>
            {change >= 0 ? "▲" : "▼"} {Math.abs(change)}% oldingi davrga nisbatan
          </span>
        )}
      </section>

      <section className="bx-card">
        <p className="bx-chart-info">
          {selected !== null
            ? `${report.buckets[selected].label}: ${formatMoney(report.buckets[selected].value)}`
            : "Ustunni bosing"}
        </p>
        <div className="bx-chart" role="list">
          {report.buckets.map((b, i) => (
            <button
              key={b.from}
              type="button"
              role="listitem"
              className={`bx-bar ${selected === i ? "is-active" : ""}`}
              onClick={() => setPicked(i)}
              aria-label={`${b.label}: ${formatMoney(b.value)}`}
            >
              <em>{b.value ? shortMoney(b.value) : ""}</em>
              <span style={{ height: `${Math.max((b.value / max) * 100, 3)}%` }} />
              <small>{b.label}</small>
            </button>
          ))}
        </div>
      </section>

      <div className="bx-stats">
        <div className="bx-stat">
          <span>Mijozlar</span>
          <strong>{report.list.length}</strong>
        </div>
        <div className="bx-stat">
          <span>O'rtacha chek</span>
          <strong>{groupDigits(average)}</strong>
        </div>
      </div>

      <section>
        <div className="bx-sec-title">
          <h2>Xizmatlar bo'yicha</h2>
        </div>
        {byService.length === 0 ? (
          <p className="bx-empty-line">Bu davrda daromad yo'q</p>
        ) : (
          <div className="bx-card bx-breakdown">
            {byService.map((s) => (
              <div key={s.name}>
                <div className="bx-breakdown-row">
                  <span>
                    {s.name} <small className="bx-muted">× {s.count}</small>
                  </span>
                  <b>{formatMoney(s.total)}</b>
                </div>
                <div className="bx-meter">
                  <i style={{ width: `${(s.total / byService[0].total) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
