import { useRef, useState, useSyncExternalStore } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { siteLocalePath } from "../../../utils/siteLocale.js";
import { authLocale, authUi } from "../authLocale.js";
import { AuthLayout, PhoneField, RoleSwitch } from "./AuthParts";
import PasswordField from "./PasswordField";
import CaptchaField from "./CaptchaField";
import { checkCaptcha, createCaptcha } from "../utils/captcha";
import { getRegistration, subscribeRegistration, registrationPath, startRegistration, registrationPasswordError, registrationError, REGISTRATION_PASSWORD_HINT } from "../utils/registration";
import "../auth-ui.css";

const SPECIALTIES = [
  { value: "barber", label: "Sartarosh" },
  { value: "cosmetolog", label: "Kosmetolog" },
  { value: "stylist", label: "Stilist" },
];

export default function RegistrationForm({ role }) {
  const navigate = useNavigate();
  const location = useLocation();
  const lang = authLocale(location.search);
  const ui = authUi(lang);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [specialty, setSpecialty] = useState("barber");
  const [captcha, setCaptcha] = useState(createCaptcha);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const pending = useSyncExternalStore(subscribeRegistration, getRegistration, () => null);
  const clear = (field) => setErrors((previous) => ({ ...previous, [field]: "", submit: "" }));

  function refreshCaptcha() {
    setCaptcha(createCaptcha());
    setCaptchaAnswer("");
    clear("captcha");
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const digits = phone.replace(/\D/g, "");
    const next = {};
    if (digits.length !== 9) next.phone = ui.invalidPhone;
    const passwordIssue = registrationPasswordError(password);
    if (passwordIssue) next.password = passwordIssue;
    if (!confirmPassword) next.confirmPassword = ui.repeatRequired;
    else if (password !== confirmPassword) next.confirmPassword = ui.repeatMismatch;
    const captchaError = checkCaptcha(captcha, captchaAnswer);
    if (captchaError) {
      next.captcha = captchaError;
      if (captchaAnswer.trim() || Date.now() >= captcha.expiresAt) {
        setCaptcha(createCaptcha());
        setCaptchaAnswer("");
      }
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    submitting.current = true;
    setBusy(true);
    try {
      await startRegistration({ phone: "+998" + digits, password, role, ...(role === "barber" ? { specialty } : {}) });
      setPassword("");
      setConfirmPassword("");
      navigate(siteLocalePath("/otp", lang), { replace: true });
    } catch (error) {
      setErrors({ submit: registrationError(error) });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <AuthLayout className="au-page--entry au-page--signup">
      <RoleSwitch role={role} />
      <div className="au-signup-heading">
        <h1 className="au-title">{role === "barber" ? ui.barberSignupTitle : ui.signupTitle}</h1>
      </div>
      {pending?.sessionToken && ['otp', 'verified'].includes(pending.stage) && <p className="au-foot"><Link to={siteLocalePath(registrationPath(pending), lang)}>{pending.stage === 'verified' ? ui.pendingProfile : ui.pendingOtp}</Link></p>}
      <form className="au-form" onSubmit={submit} noValidate aria-busy={busy}>
        <fieldset className="au-registration-fields" disabled={busy}>
          <PhoneField value={phone} error={errors.phone} onChange={(value) => { setPhone(value); clear("phone"); }} />
          <PasswordField value={password} signup maxLength={128} hint={REGISTRATION_PASSWORD_HINT} error={errors.password} onChange={(value) => {
            setPassword(value);
            setErrors((previous) => ({ ...previous, password: "", confirmPassword: "", submit: "" }));
          }} />
          <PasswordField value={confirmPassword} confirmation maxLength={128} matchState={confirmPassword ? (password === confirmPassword ? "match" : "mismatch") : null} error={errors.confirmPassword} onChange={(value) => { setConfirmPassword(value); clear("confirmPassword"); }} />
          {role === "barber" && <div className="au-field"><label className="au-label" htmlFor="specialty">{ui.specialty}</label><select required id="specialty" className="au-input" value={specialty} onChange={(event) => setSpecialty(event.target.value)}>{SPECIALTIES.map((item) => <option key={item.value} value={item.value}>{item.value === "barber" ? ui.barberSpecialty : item.value === "cosmetolog" ? ui.cosmetologist : ui.stylist}</option>)}</select></div>}
          <CaptchaField challenge={captcha} value={captchaAnswer} error={errors.captcha} onChange={(value) => { setCaptchaAnswer(value); clear("captcha"); }} onRefresh={refreshCaptcha} />
        </fieldset>
        {errors.submit && <p className="au-error" role="alert">{errors.submit}</p>}
        <button type="submit" className="au-btn" disabled={busy}>{busy ? ui.preparing : ui.getCode}</button>
      </form>
      <p className="au-foot">{ui.hasAccount} <Link to={siteLocalePath("/login", lang)}>{ui.login}</Link></p>
    </AuthLayout>
  );
}
