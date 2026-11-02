import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LocationPicker from "../../components/LocationPicker";
import { AuthLayout } from "../auth/components/AuthParts";
import { getSession, setSession } from "../auth/utils/session";
import "../auth/auth-ui.css";
import { updateProfile, useBarber } from "./data/store";
import { WEEKDAYS } from "./data/format";

// Time options every 30 minutes: 06:00 ... 23:30
const TIMES = Array.from({ length: 36 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

// Monday first, Sunday last
const ORDER = [1, 2, 3, 4, 5, 6, 0];

// First-time setup right after barber sign-up: location + working hours.
// Services are added later (Profil → Xizmatlar), so the form stays short.
export default function BarberProfileEdit() {
  const navigate = useNavigate();
  const { profile } = useBarber();

  const [location, setLocation] = useState(profile.location);
  const [address, setAddress] = useState(profile.address);
  const [hours, setHours] = useState(profile.hours);
  const [errors, setErrors] = useState({});

  const find = (day) => hours.find((h) => h.day === day);
  const change = (day, patch) => {
    setHours(hours.map((h) => (h.day === day ? { ...h, ...patch } : h)));
    setErrors((previous) => ({ ...previous, hours: "" }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const next = {};
    const working = hours.filter((h) => !h.isOff);

    if (!location) next.location = "Joylashuvni xaritada belgilang.";
    if (working.length === 0) next.hours = "Kamida bitta ish kunini tanlang.";
    else if (working.some((h) => h.start >= h.end))
      next.hours = "Boshlanish vaqti tugash vaqtidan oldin bo'lishi kerak.";

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    if (!updateProfile({ location, address: address.trim(), hours })) {
      return setErrors({ submit: "Ma'lumotlarni saqlashda xatolik yuz berdi." });
    }
    setSession({ ...getSession(), setupDone: true });
    navigate("/barber/pending");
  };

  return (
    <AuthLayout wide>
      <h1 className="au-title">Profilingizni sozlang</h1>
      <p className="au-sub">
        Mijozlar sizni topishi uchun ish joyingiz va ish vaqtingizni belgilang.
      </p>

      <form className="au-form" onSubmit={handleSubmit} noValidate>
        {/* Location */}
        <section className="au-block au-map">
          <h2>1. Joylashuv</h2>
          <LocationPicker
            value={location}
            onChange={(value) => {
              setLocation(value);
              setErrors((previous) => ({ ...previous, location: "" }));
            }}
          />
          <div className="au-field">
            <label className="au-label" htmlFor="address">
              Manzil (ixtiyoriy)
            </label>
            <input
              id="address"
              className="au-input"
              placeholder="Masalan: Chilonzor, 9-kvartal"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </div>
          {errors.location && <p className="au-error" role="alert">{errors.location}</p>}
        </section>

        {/* Working hours */}
        <section className="au-block">
          <h2>2. Ish vaqti</h2>
          {ORDER.map((day) => {
            const h = find(day);
            return (
              <div key={day} className="au-day">
                <strong className={h.isOff ? "is-off" : ""}>{WEEKDAYS[day]}</strong>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!h.isOff}
                  aria-label={`${WEEKDAYS[day]} ishlaysizmi`}
                  className={`au-switch ${h.isOff ? "" : "is-on"}`}
                  onClick={() => change(day, { isOff: !h.isOff })}
                />
                {!h.isOff && (
                  <div className="au-day-times">
                    <select className="au-input" value={h.start} aria-label="Boshlanish" onChange={(e) => change(day, { start: e.target.value })}>
                      {TIMES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <span>–</span>
                    <select className="au-input" value={h.end} aria-label="Tugash" onChange={(e) => change(day, { end: e.target.value })}>
                      {TIMES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
          {errors.hours && <p className="au-error" role="alert">{errors.hours}</p>}
        </section>

        <p className="au-info">
          Xizmat va narxlarni keyin <b>Profil → Xizmatlar</b> bo'limida qo'shasiz.
        </p>

        {errors.submit && <p className="au-error" role="alert">{errors.submit}</p>}

        <button type="submit" className="au-btn">
          Saqlash <span aria-hidden="true">→</span>
        </button>
      </form>
    </AuthLayout>
  );
}
