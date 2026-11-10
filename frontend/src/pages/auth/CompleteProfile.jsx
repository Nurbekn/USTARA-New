import { useRef, useState, useSyncExternalStore } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AuthLayout } from "./components/AuthParts";
import { dashboardPath, getSession, getSessionSnapshot, subscribeSession } from "./utils/session";
import { updateProfile, useBarber } from "../barber/data/store";
import { saveCustomerProfile } from "../user/data/profile";
import { hasProfileName, profileForSession } from "./profileCompletion";
import "./auth-ui.css";

function ProfileNameForm({ session, profile }) {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState(profile.firstName || "");
  const [lastName, setLastName] = useState(profile.lastName || "");
  const [errors, setErrors] = useState({});
  const saving = useRef(false);

  function submit(event) {
    event.preventDefault();
    if (saving.current) return;
    const next = {};
    if (firstName.trim().length < 2) next.firstName = "Ismingizni kiriting (kamida 2 belgi).";
    if (lastName.trim().length < 2) next.lastName = "Familiyangizni kiriting (kamida 2 belgi).";
    setErrors(next);
    if (Object.keys(next).length) {
      event.currentTarget.elements.namedItem(Object.keys(next)[0])?.focus();
      return;
    }

    saving.current = true;
    try {
      const names = { firstName: firstName.trim(), lastName: lastName.trim(), nameConfirmed: true };
      if (session.role === "customer") {
        saveCustomerProfile(session.phone, { ...profile, ...names });
      } else if (!updateProfile(names)) {
        throw new Error("Profile could not be saved");
      }
      navigate(dashboardPath(session), { replace: true });
    } catch {
      saving.current = false;
      setErrors({ submit: "Ma’lumotlar saqlanmadi. Brauzer xotirasini tekshirib, qayta urinib ko‘ring." });
    }
  }

  return (
    <AuthLayout className="au-page--identity">
      <h1 className="au-title">Sizni qanday chaqiraylik?</h1>
      <p className="au-sub">Ism va familiyangizni kiriting. Bu ma’lumotlar profilingizda ko‘rinadi.</p>
      <form className="au-form" onSubmit={submit} noValidate>
        <div className="au-field">
          <label className="au-label" htmlFor="firstName">Ism</label>
          <input id="firstName" name="firstName" className={`au-input${errors.firstName ? " has-error" : ""}`} autoComplete="given-name" maxLength={80} required value={firstName} onChange={(event) => { setFirstName(event.target.value); setErrors((previous) => ({ ...previous, firstName: "", submit: "" })); }} aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? "firstName-error" : undefined} />
          {errors.firstName && <p className="au-error" id="firstName-error" role="alert">{errors.firstName}</p>}
        </div>
        <div className="au-field">
          <label className="au-label" htmlFor="lastName">Familiya</label>
          <input id="lastName" name="lastName" className={`au-input${errors.lastName ? " has-error" : ""}`} autoComplete="family-name" maxLength={80} required value={lastName} onChange={(event) => { setLastName(event.target.value); setErrors((previous) => ({ ...previous, lastName: "", submit: "" })); }} aria-invalid={!!errors.lastName} aria-describedby={errors.lastName ? "lastName-error" : undefined} />
          {errors.lastName && <p className="au-error" id="lastName-error" role="alert">{errors.lastName}</p>}
        </div>
        {errors.submit && <p className="au-error" role="alert">{errors.submit}</p>}
        <button type="submit" className="au-btn">Davom etish</button>
      </form>
    </AuthLayout>
  );
}

export default function CompleteProfile() {
  useSyncExternalStore(subscribeSession, getSessionSnapshot, () => null);
  const session = getSession();
  const { profile: barberProfile } = useBarber();
  if (!session) return <Navigate to="/login" replace />;
  const profile = profileForSession(session, barberProfile);
  if (hasProfileName(profile)) return <Navigate to={dashboardPath(session)} replace />;
  return <ProfileNameForm key={`${session.role}:${session.phone}`} session={session} profile={profile} />;
}
