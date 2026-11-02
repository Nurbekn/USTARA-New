import { useState } from "react";
import PageHeader from "./components/PageHeader";
import { useToast } from "./components/Toast";
import { updateProfile, useBarber } from "./data/store";
import { WEEKDAYS } from "./data/format";

// Time options every 30 minutes: 06:00 ... 23:30
const TIMES = Array.from({ length: 36 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

// Monday first (Uzbek week), Sunday last
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function Schedule() {
  const { profile } = useBarber();
  const { toast, show } = useToast();
  const [draft, setDraft] = useState(profile.hours);

  const dirty = JSON.stringify(draft) !== JSON.stringify(profile.hours);
  const find = (day) => draft.find((h) => h.day === day);
  const invalid = draft.some((h) => !h.isOff && h.start >= h.end);

  const change = (day, patch) =>
    setDraft(draft.map((h) => (h.day === day ? { ...h, ...patch } : h)));

  // Copy the first working day's time to all other working days
  const copyToAll = () => {
    const first = ORDER.map(find).find((h) => !h.isOff);
    if (!first) return;
    setDraft(draft.map((h) => (h.isOff ? h : { ...h, start: first.start, end: first.end })));
    show(`${first.start} – ${first.end} hammasiga qo'llandi`);
  };

  const save = () => {
    if (invalid) return show("Tugash vaqti boshlanishdan keyin bo'lishi kerak");
    updateProfile({ hours: draft });
    show("Jadval saqlandi");
  };

  return (
    <div className="bx-page">
      <PageHeader title="Jadval" subtitle="Ish vaqtingizni belgilang" />

      <div className="bx-card bx-row">
        <div>
          <strong>Bron qabul qilish</strong>
          <p className="bx-muted">
            {profile.isAvailable ? "Mijozlar sizga bron qila oladi" : "Hozir yangi bronlar yopiq"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={profile.isAvailable}
          aria-label="Bron qabul qilish"
          className={`bx-switch ${profile.isAvailable ? "is-on" : ""}`}
          onClick={() => updateProfile({ isAvailable: !profile.isAvailable })}
        />
      </div>

      <div className="bx-card bx-days">
        {ORDER.map((day) => {
          const h = find(day);
          return (
            <div key={day} className={`bx-day-row ${h.isOff ? "is-off" : ""}`}>
              <div className="bx-day-head">
                <strong>{WEEKDAYS[day]}</strong>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!h.isOff}
                  aria-label={`${WEEKDAYS[day]} ishlaysizmi`}
                  className={`bx-switch ${h.isOff ? "" : "is-on"}`}
                  onClick={() => change(day, { isOff: !h.isOff })}
                />
              </div>
              {h.isOff ? (
                <span className="bx-muted">Dam olish kuni</span>
              ) : (
                <div className="bx-time-pair">
                  <select
                    className="bx-input"
                    value={h.start}
                    aria-label="Boshlanish"
                    onChange={(e) => change(day, { start: e.target.value })}
                  >
                    {TIMES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <span>–</span>
                  <select
                    className="bx-input"
                    value={h.end}
                    aria-label="Tugash"
                    onChange={(e) => change(day, { end: e.target.value })}
                  >
                    {TIMES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" className="bx-btn bx-btn-ghost bx-btn-block" onClick={copyToAll}>
        Birinchi kun vaqtini hammasiga qo'llash
      </button>

      <div className="bx-savebar">
        <button
          type="button"
          className="bx-btn bx-btn-primary bx-btn-block"
          disabled={!dirty}
          onClick={save}
        >
          {dirty ? "Saqlash" : "Saqlangan"}
        </button>
      </div>
      {toast}
    </div>
  );
}
