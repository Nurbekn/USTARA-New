import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LocationPicker from "../../components/LocationPicker";
import { AuthLayout } from "../auth/components/AuthParts";
import { getSession, setSession } from "../auth/utils/session.js";
import "../auth/auth-ui.css";
import "./barber.css";
import { updateProfile, useBarber } from "./data/store";
import { WEEKDAYS } from "./data/format";

const TIMES = Array.from({ length: 36 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;

  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;
});

const ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function BarberProfileEdit() {
  const navigate = useNavigate();
  const { profile } = useBarber();

  const [location, setLocation] = useState(profile.location);
  const [address, setAddress] = useState(profile.address || "");
  const [hours, setHours] = useState(profile.hours);
  const [errors, setErrors] = useState({});

  const find = (day) => hours.find((h) => h.day === day);
  const workingCount = hours.filter((h) => !h.isOff).length;

  const change = (day, patch) => {
    setHours((previous) =>
      previous.map((h) => {
        if (h.day !== day) return h;

        const next = { ...h, ...patch };

        // Boshlanish vaqti tugashdan keyin bo'lib qolmasin.
        if (patch.start && next.start >= next.end) {
          const index = TIMES.indexOf(next.start);
          next.end = TIMES[Math.min(index + 2, TIMES.length - 1)];
        }

        return next;
      }),
    );

    setErrors((previous) => ({ ...previous, hours: "" }));
  };

  // Dushanba vaqtini barcha ish kunlariga qo'llash.
  // Dushanba vaqtini barcha ish kunlariga qo'llash.
  const applyToAll = () => {
    const monday = hours.find((h) => h.day === 1);

    if (!monday || monday.isOff) {
      setErrors((previous) => ({
        ...previous,
        hours: "Avval Dushanba kunini ish kuni qilib, vaqtini belgilang.",
      }));
      return;
    }

    setHours((previous) =>
      previous.map((h) => {
        if (h.day === 1 || h.isOff) return h;

        return {
          ...h,
          start: monday.start,
          end: monday.end,
        };
      }),
    );

    setErrors((previous) => ({
      ...previous,
      hours: "",
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const next = {};
    const working = hours.filter((h) => !h.isOff);

    if (!location) {
      next.location = "Joylashuvni xaritada belgilang.";
    }

    if (working.length === 0) {
      next.hours = "Kamida bitta ish kunini tanlang.";
    } else if (working.some((h) => h.start >= h.end)) {
      next.hours = "Boshlanish vaqti tugash vaqtidan oldin bo'lishi kerak.";
    }

    setErrors(next);

    if (Object.keys(next).length > 0) return;

    const success = updateProfile({
      location,
      address: address.trim(),
      hours,
    });

    if (!success) {
      setErrors({ submit: "Ma'lumotlarni saqlashda xatolik yuz berdi." });
      return;
    }

    setSession({
      ...getSession(),
      setupDone: true,
    });

    navigate("/barber/pending");
  };

  return (
    <AuthLayout wide>
      <form onSubmit={handleSubmit} className="bp-page" noValidate>
        <header className="bp-head">
          <h1>Profilni sozlash</h1>
          <p>
            Mijozlar sizni xaritadan topishi va ish vaqtingizga yozilishi uchun
            ikkita narsani to'ldiring.
          </p>
        </header>

        <section className="bp-card">
          <div className="bp-card-head">
            <h2>Ish joyingiz</h2>
            <span className={`bp-badge ${location ? "is-ok" : ""}`}>
              {location ? "Belgilandi" : "Belgilanmagan"}
            </span>
          </div>

          <LocationPicker
            value={location}
            onChange={(value) => {
              setLocation(value);
              setErrors((previous) => ({ ...previous, location: "" }));
            }}
            address={address}
            onAddressChange={setAddress}
            error={errors.location}
          />
        </section>

        <section className="bp-card">
          <div className="bp-card-head">
            <h2>Ish vaqti</h2>
            <span className="bp-badge">{workingCount} kun ishlaydi</span>
          </div>

          <button type="button" className="bp-link" onClick={applyToAll}>
            Dushanba vaqtini barcha ish kunlariga qo'llash
          </button>

          <div className="bp-days">
            {ORDER.map((day) => {
              const item = find(day);

              if (!item) return null;

              return (
                <div
                  className={`bp-day ${item.isOff ? "is-off" : ""}`}
                  key={day}
                >
                  <label className="bp-switch">
                    <input
                      type="checkbox"
                      checked={!item.isOff}
                      onChange={(event) =>
                        change(day, { isOff: !event.target.checked })
                      }
                    />
                    <i aria-hidden="true" />
                    <span>{WEEKDAYS[day]}</span>
                  </label>

                  {item.isOff ? (
                    <span className="bp-off-text">Dam olish kuni</span>
                  ) : (
                    <div className="bp-times">
                      <select
                        aria-label={`${WEEKDAYS[day]} boshlanish vaqti`}
                        value={item.start}
                        onChange={(event) =>
                          change(day, { start: event.target.value })
                        }
                      >
                        {TIMES.map((time) => (
                          <option key={time} value={time}>
                            {time}
                          </option>
                        ))}
                      </select>

                      <b>-</b>

                      <select
                        aria-label={`${WEEKDAYS[day]} tugash vaqti`}
                        value={item.end}
                        onChange={(event) =>
                          change(day, { end: event.target.value })
                        }
                      >
                        {TIMES.map((time) => (
                          <option key={time} value={time}>
                            {time}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {errors.hours && (
            <p className="bp-note is-error" role="alert">
              {errors.hours}
            </p>
          )}
        </section>

        <div className="bp-savebar">
          {errors.submit && (
            <p className="bp-note is-error" role="alert">
              {errors.submit}
            </p>
          )}

          <button type="submit" className="bp-btn bp-btn-primary bp-save">
            Saqlash va davom etish
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
