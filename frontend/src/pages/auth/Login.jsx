import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout, PhoneField } from "./components/AuthParts";
import { dashboardPath, setSession } from "./utils/session";
import { clearRegistration } from "./utils/registration";
import { login } from "./utils/login";
import { refreshBarberData } from "../barber/data/store";
import { bookingDraftResumePath } from "../user/barber/bookingDraft.js";
import "./auth-ui.css";
import PasswordField from "./components/PasswordField";
import { siteLocalePath } from "../../utils/siteLocale.js";
import { authLocale, authUi } from "./authLocale.js";

// The shared login page restores either backend role without local credentials.
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const lang = authLocale(location.search);
  const ui = authUi(lang);
  const [phone, setPhone] = useState(() => typeof location.state?.phone === "string" ? location.state.phone : "");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsReactivation, setNeedsReactivation] = useState(false);
  const submitting = useRef(false);
  const [cooldown, setCooldown] = useState(null);
  const [now, setNow] = useState(Date.now);
  const remaining = cooldown?.phone === phone.replace(/\D/g, "")
    ? Math.max(0, Math.ceil((cooldown.until - now) / 1000)) : 0;
  useEffect(() => {
    if (!cooldown) return;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= cooldown.until) setCooldown(null);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSubmit = async (event, reactivate = false) => {
    event.preventDefault();
    if (submitting.current || (cooldown?.phone === phone.replace(/\D/g, "") && cooldown.until > Date.now())) return;
    setError("");
    setPasswordError("");
    const digits = phone.replace(/\D/g, "");
    const full = "+998" + digits;

    if (digits.length !== 9) {
      setError(ui.invalidPhone);
      return;
    }

    if (!password || !password.trim()) {
      setPasswordError(ui.missingPassword);
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const { session } = await login(full, password, reactivate);
      setSession(session);
      if (session.role === "barber") await refreshBarberData();
      clearRegistration();
      setPassword("");
      setNeedsReactivation(false);
      navigate(session.role === 'customer' ? bookingDraftResumePath() || dashboardPath(session) : dashboardPath(session), { replace: true });
    } catch (error) {
      if (error.code === 'account_deactivated') setNeedsReactivation(true);
      const seconds = error.metadata?.retryAfter;
      if (error.status === 429 && Number.isFinite(seconds) && seconds > 0) {
        const time = Date.now();
        setNow(time);
        setCooldown({ phone: digits, until: time + Math.ceil(seconds) * 1000 });
      } else setPasswordError((lang === "uz" ? error.message : null) || ui.loginFailed);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <AuthLayout className="au-page--entry">
      <h1 className="au-title">{ui.loginTitle}</h1>
      {location.state?.phoneChanged && <p role="status" className="au-sub">{ui.phoneChanged}</p>}
      <p className="au-sub">{ui.loginIntro}</p>
      {bookingDraftResumePath() && <p role="status" className="au-sub">{ui.savedBooking}</p>}

      <form className="au-form" onSubmit={handleSubmit} noValidate aria-busy={busy}>
        <fieldset className="au-registration-fields" disabled={busy}>
          <PhoneField
            value={phone}
            error={error}
            onChange={(value) => {
              setPhone(value);
              setError("");
              setPasswordError("");
              setNeedsReactivation(false);
            }}
          />

          <PasswordField value={password} error={passwordError} onChange={(value) => { setPassword(value); setPasswordError(""); setNeedsReactivation(false); }} />

          <Link to={siteLocalePath("/forgot-password", lang)} state={{ phone }} className="au-forgot-link">{ui.forgot}</Link>

        </fieldset>

        {remaining > 0 && <p role="alert">{ui.locked} {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")} {ui.left}</p>}
        <button type="submit" className="au-btn" disabled={busy || remaining > 0}>
          {busy ? ui.check : ui.login}
        </button>
        {needsReactivation && <div role="status" className="au-sub" style={{ marginTop: 12 }}>
          {ui.reactivateHint}
          <button type="button" className="au-btn" disabled={busy || remaining > 0}
            onClick={(event) => handleSubmit(event, true)}>
            {ui.reactivate}
          </button>
        </div>}
      </form>

      <p className="au-foot">
        {ui.noAccount} <Link to={siteLocalePath("/signup", lang)}>{ui.signup}</Link>
      </p>
    </AuthLayout>
  );
}
