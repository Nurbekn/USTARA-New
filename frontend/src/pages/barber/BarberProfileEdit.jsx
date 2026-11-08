import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LocationPicker from "../../components/LocationPicker";
import { isValidLocation } from "../../components/locationSearch";
import { AuthLayout } from "../auth/components/AuthParts";
import { getSession, setSession } from "../auth/utils/session.js";
import "../auth/auth-ui.css";
import "./barber.css";
import { updateProfile, useBarber } from "./data/store";
import WorkingHours from "./components/WorkingHours";

export default function BarberProfileEdit() {
  const navigate = useNavigate();
  const { profile } = useBarber();

  const [location, setLocation] = useState(profile.location);
  const [address, setAddress] = useState(profile.address || "");
  const [hours, setHours] = useState(profile.hours);
  const [errors, setErrors] = useState({});

  const workingCount = hours.filter((h) => !h.isOff).length;

  const handleSubmit = (event) => {
    event.preventDefault();

    const next = {};
    const working = hours.filter((h) => !h.isOff);

    if (!isValidLocation(location)) {
      next.location = "Joylashuvni xaritada belgilang.";
    }

    if (working.length === 0) {
      next.hours = "Kamida bitta ish kunini tanlang.";
    } else if (working.some((h) => h.start >= h.end)) {
      next.hours = "Boshlanish vaqti tugash vaqtidan oldin bo'lishi kerak.";
    }

    setErrors(next);

    if (Object.keys(next).length > 0) {
      requestAnimationFrame(() => document.querySelector(".bp-page [role='alert']")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }

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
    <AuthLayout wide className="bp-setup">
      <form onSubmit={handleSubmit} className="bp-page" noValidate>
        <header className="bp-head">
          <h1>Profilni sozlash</h1>
          <p>
            Mijozlar sizni xaritadan topishi va ish vaqtingizga yozilishi uchun
            ikkita narsani to'ldiring.
          </p>
        </header>

        <section className="bp-card" aria-label="Ish joyingiz">
          <div className="bp-card-head">
            <h2><span className="bp-step">1</span> Ish joyingiz</h2>
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
            <h2><span className="bp-step">2</span> Ish vaqti</h2>
            <span className="bp-badge">{workingCount} kun ishlaydi</span>
          </div>

          <WorkingHours value={hours} onChange={(value) => {
            setHours(value);
            setErrors((previous) => ({ ...previous, hours: "" }));
          }} />

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
