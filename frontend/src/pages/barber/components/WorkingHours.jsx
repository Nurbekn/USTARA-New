import Icon from "../../../components/Icon";
import { useState } from "react";
import { WEEKDAYS } from "../data/format";
import "./working-hours.css";

const ORDER = [1, 2, 3, 4, 5, 6, 0];
const TIMES = Array.from({ length: 36 }, (_, i) => {
  const minutes = 360 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

export default function WorkingHours({ value, onChange }) {
  const [applied, setApplied] = useState(null);
  const appliedNow = applied?.signature === JSON.stringify(value);
  const days = ORDER.map((day) => value.find((item) => item.day === day)).filter(Boolean);
  const first = days.find((item) => !item.isOff);
  const change = (day, patch) => {
    setApplied(null);
    onChange(value.map((item) => item.day === day ? { ...item, ...patch } : item));
  };

  function applyToWorkdays() {
    if (!first || first.start >= first.end) return;
    const next = value.map((item) => item.isOff ? item : { ...item, start: first.start, end: first.end });
    onChange(next);
    setApplied({ signature: JSON.stringify(next), start: first.start, end: first.end, count: next.filter((item) => !item.isOff).length });
  }

  return (
    <div className="wh-editor">
      <div className="wh-tools">
        <p>Kunlarni yoqing va ish vaqtini tanlang. Toshkent vaqti.</p>
        <button type="button" className={appliedNow ? "is-applied" : ""} disabled={!first || first.start >= first.end} onClick={applyToWorkdays}>
          {appliedNow && <Icon name="check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" />}
          {appliedNow ? "Ish kunlariga qo‘llanildi" : first ? `${WEEKDAYS[first.day]} vaqtini ish kunlariga qo'llash` : "Avval ish kunini tanlang"}
        </button>
        <p className="wh-apply-status" role="status" aria-live="polite">{appliedNow ? `${applied.start}–${applied.end} vaqti ${applied.count} ta ish kuniga qo‘llandi.` : ""}</p>
      </div>
      <div className="wh-days">
        {days.map((item) => {
          const invalid = !item.isOff && item.start >= item.end;
          return (
            <div key={item.day} className={`wh-day ${item.isOff ? "is-off" : ""}`}>
              <button type="button" className="wh-toggle" role="switch" aria-checked={!item.isOff} aria-label={`${WEEKDAYS[item.day]} ish kuni`} onClick={() => change(item.day, { isOff: !item.isOff })}>
                <span><strong>{WEEKDAYS[item.day]}</strong><small>{item.isOff ? "Dam olish kuni" : "Ish kuni"}</small></span>
                <span className="wh-track" aria-hidden="true" />
              </button>
              {!item.isOff && <div className="wh-times">
                {[["start", "Boshlanish"], ["end", "Tugash"]].map(([field, label]) => (
                  <label key={field}><span>{label}</span>
                    <select value={item[field]} aria-label={`${WEEKDAYS[item.day]} ${label.toLowerCase()} vaqti`} aria-invalid={invalid} onChange={(event) => change(item.day, { [field]: event.target.value })}>
                      {[...new Set([...TIMES, item[field]])].sort().map((time) => <option key={time} value={time} disabled={field === "end" && time <= item.start}>{time}</option>)}
                    </select>
                  </label>
                ))}
              </div>}
              {invalid && <p className="wh-error" role="alert">Tugash vaqtini boshlanishdan keyin tanlang.</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
