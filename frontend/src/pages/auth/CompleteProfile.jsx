import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, Navigate, useNavigate, useLocation } from "react-router-dom";
import { readSiteLocale, siteLocalePath } from "../../utils/siteLocale.js";
import { v144InnerUi } from "./innerLocaleV144.js";
import { AuthLayout } from "./components/AuthParts";
import { dashboardPath, getSession, getSessionSnapshot, subscribeSession, setSession } from "./utils/session";
import { updateProfile, useBarber } from "../barber/data/store";
import { bookingDraftResumePath } from "../user/barber/bookingDraft.js";
import { saveCustomerProfileToServer } from "../user/data/profile";
import { hasProfileName, profileForSession } from "./profileCompletion";
import { canonicalProfileNames, normalizeProfilePart } from "../../utils/profileIdentity.js";
import { clearRegistration, completeRegistration, getRegistration, subscribeRegistration, registrationNameError, registrationError, registrationSession } from "./utils/registration";
import "./auth-ui.css";

function ProfileNameForm({ session, profile, registration }) {
  const navigate = useNavigate();
  const location = useLocation();
  const lang = readSiteLocale(location.search);
  const ui = v144InnerUi(lang).completion;
  const [firstName, setFirstName] = useState(profile.firstName || "");
  const [lastName, setLastName] = useState(profile.lastName || "");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now);
  const saving = useRef(false);
  useEffect(() => {
    if (!registration || registration.stage === "completed") return;
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [registration]);
  const remaining = registration ? Math.max(0, Math.ceil((registration.completionExpiresAt - now) / 1000)) : null;
  const expired = registration?.stage === "verified" && remaining === 0;

  async function submit(event) {
    event.preventDefault();
    if (saving.current || expired) return;
    const next = {};
    const firstError = registrationNameError(firstName);
    const lastError = registrationNameError(lastName);
    if (firstError) next.firstName = lang === "uz" ? firstError : ui.nameError;
    if (lastError) next.lastName = lang === "uz" ? lastError : ui.nameError;
    setErrors(next);
    if (Object.keys(next).length) {
      event.currentTarget.elements.namedItem(Object.keys(next)[0])?.focus();
      return;
    }

    saving.current = true;
    setBusy(true);
    try {
      if (registration) {
        const result = await completeRegistration(normalizeProfilePart(firstName), normalizeProfilePart(lastName));
        const accountSession = registrationSession(result, registration);
        const account = result[registration.role];
        setSession({ ...accountSession, profile: { id: account.id, first_name: account.first_name, last_name: account.last_name, phone: accountSession.phone } });
        clearRegistration();
        navigate(accountSession.role === 'customer' ? bookingDraftResumePath() || dashboardPath(accountSession) : dashboardPath(accountSession), { replace: true });
        return;
      }
      const names = { ...canonicalProfileNames(firstName, lastName), nameConfirmed: true };
      if (session.role === "customer") {
        await saveCustomerProfileToServer({ ...profile, ...names });
      } else {
        await updateProfile(names);
      }
      navigate(session.role === 'customer' ? bookingDraftResumePath() || dashboardPath(session) : dashboardPath(session), { replace: true });
    } catch (error) {
      const created = getRegistration()?.stage === "completed";
      setErrors({ submit: registration ? (created ? ui.createdSaveError : registrationError(error)) : ui.saveError });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <AuthLayout className="au-page--identity">
      <h1 className="au-title">{ui.title}</h1>
      <p className="au-sub">{ui.intro}</p>
      {registration?.stage === "verified" && <p className={expired ? "au-error" : "au-foot"} role={expired ? "alert" : "status"}>{expired ? registration.terminalError || ui.expired : `${ui.remaining}: ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}</p>}
      {expired && <p className="au-foot"><Link to={siteLocalePath(registration.role === "barber" ? "/signup/sartarosh" : "/signup", lang)} onClick={clearRegistration}>{ui.restart}</Link></p>}
      <form className="au-form" onSubmit={submit} noValidate aria-busy={busy}>
        <div className="au-field">
          <label className="au-label" htmlFor="firstName">{ui.first}</label>
          <input id="firstName" name="firstName" className={`au-input${errors.firstName ? " has-error" : ""}`} autoComplete="given-name" maxLength={80} disabled={busy || expired || registration?.stage === "completed"} required value={firstName} onChange={(event) => { setFirstName(event.target.value); setErrors((previous) => ({ ...previous, firstName: "", submit: "" })); }} aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? "firstName-error" : undefined} />
          {errors.firstName && <p className="au-error" id="firstName-error" role="alert">{errors.firstName}</p>}
        </div>
        <div className="au-field">
          <label className="au-label" htmlFor="lastName">{ui.last}</label>
          <input id="lastName" name="lastName" className={`au-input${errors.lastName ? " has-error" : ""}`} autoComplete="family-name" maxLength={80} disabled={busy || expired || registration?.stage === "completed"} required value={lastName} onChange={(event) => { setLastName(event.target.value); setErrors((previous) => ({ ...previous, lastName: "", submit: "" })); }} aria-invalid={!!errors.lastName} aria-describedby={errors.lastName ? "lastName-error" : undefined} />
          {errors.lastName && <p className="au-error" id="lastName-error" role="alert">{errors.lastName}</p>}
        </div>
        {errors.submit && <p className="au-error" role="alert">{errors.submit}</p>}
        <button type="submit" className="au-btn" disabled={busy || expired}>{busy ? ui.saving : registration?.stage === "completed" ? ui.retrySession : registration ? ui.finish : ui.next}</button>
      </form>
    </AuthLayout>
  );
}

export default function CompleteProfile() {
  const location = useLocation();
  const lang = readSiteLocale(location.search);
  useSyncExternalStore(subscribeSession, getSessionSnapshot, () => null);
  const session = getSession();
  const pending = useSyncExternalStore(subscribeRegistration, getRegistration, () => null);
  const { profile: barberProfile } = useBarber();
  if (pending?.stage === "otp") return <Navigate to={siteLocalePath("/otp", lang)} replace />;
  if (pending) return <ProfileNameForm key={`${pending.role}:${pending.phone}`} registration={pending} profile={{}} />;
  if (!session) return <Navigate to={siteLocalePath("/login", lang)} replace />;
  const profile = profileForSession(session, barberProfile);
  if (hasProfileName(profile)) return <Navigate to={session.role === 'customer' ? bookingDraftResumePath() || dashboardPath(session) : dashboardPath(session)} replace />;
  return <ProfileNameForm key={`${session.role}:${session.phone}`} session={session} profile={profile} />;
}
