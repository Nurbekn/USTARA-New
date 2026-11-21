import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import ArrowIcon from "../../components/ArrowIcon";
import { AuthLayout, PhoneField } from "./components/AuthParts";
import TelegramOtpNotice from "./components/TelegramOtpNotice";
import PasswordField from "./components/PasswordField";
import { registrationPasswordError, REGISTRATION_PASSWORD_HINT } from "./utils/registration";
import { resetRequest, resetError, resetDeadlines, validResetToken } from "./utils/passwordReset";
import { clearSession, getSession } from "./utils/session";
import { formatPhone } from "./utils/phone";
import "./auth-ui.css";
import { readSiteLocale, siteLocalePath } from "../../utils/siteLocale.js";
import { v144InnerUi } from "./innerLocaleV144.js";

// Reset credentials live only in memory; refresh safely restarts the flow.
const CODE_LENGTH = 5;

export default function ForgotPassword() {
  const location = useLocation();
  const lang = readSiteLocale(location.search);
  const ui = v144InnerUi(lang).forgot;
  const [phone, setPhone] = useState(() => formatPhone(typeof location.state?.phone === "string" ? location.state.phone : ""));
  const [step, setStep] = useState("phone");
  const [code, setCode] = useState(Array(CODE_LENGTH).fill(""));
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState({});
  const [deadlines, setDeadlines] = useState({ resendAt: 0, otpExpiresAt: 0, resetExpiresAt: 0 });
  const [now, setNow] = useState(Date.now);
  const seconds = Math.max(0, Math.ceil((deadlines.resendAt - now) / 1000));
  const expired = step === "code" && now >= deadlines.otpExpiresAt;
  const resetExpired = step === "password" && now >= deadlines.resetExpiresAt;
  const [busy, setBusy] = useState(false);
  const credentials = useRef({});
  const submitting = useRef(false);
  const inputs = useRef([]);
  const heading = useRef(null);
  const helpDialog = useRef(null);
  const fullPhone = "+998" + phone.replace(/\D/g, "");

  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => {
    if (!["code", "password"].includes(step)) return;
    const refresh = () => setNow(Date.now());
    const interval = window.setInterval(refresh, 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", refresh); };
  }, [step]);
  useEffect(() => () => { credentials.current = {}; }, []);

  function changeStep(next) {
    setErrors({});
    setStep(next);
  }

  async function requestCode(event) {
    event.preventDefault();
    if (submitting.current) return;
    if (phone.replace(/\D/g, "").length !== 9) {
      setErrors({ phone: ui.phoneError }); return;
    }
    submitting.current = true; setBusy(true); setErrors({});
    try {
      const data = await resetRequest("start", { phone: fullPhone });
      if (!validResetToken(data.challengeToken)) throw new Error(ui.challengeError);
      credentials.current = { phone: fullPhone, challengeToken: data.challengeToken };
      setDeadlines({ ...resetDeadlines(data), resetExpiresAt: 0 }); setNow(Date.now());
      setCode(Array(CODE_LENGTH).fill("")); changeStep("code");
    } catch (error) { setErrors({ phone: resetError(error) }); }
    finally { submitting.current = false; setBusy(false); }
  }

  function enterCode(index, text) {
    const digits = text.replace(/\D/g, "").slice(0, CODE_LENGTH);
    const start = digits.length === CODE_LENGTH ? 0 : index;
    setCode((previous) => {
      const next = [...previous];
      if (!digits) next[index] = "";
      else [...digits].forEach((digit, offset) => { if (start + offset < CODE_LENGTH) next[start + offset] = digit; });
      return next;
    });
    setErrors({});
    inputs.current[Math.min(start + digits.length, CODE_LENGTH - 1)]?.focus();
  }

  async function verifyCode(event) {
    event.preventDefault();
    if (submitting.current) return;
    if (expired) return setErrors({ code: ui.expiredCode });
    if (code.length !== CODE_LENGTH || !code.every((digit) => /^\d$/.test(digit))) {
      return setErrors({ code: ui.codeError });
    }
    submitting.current = true; setBusy(true); setErrors({});
    try {
      const data = await resetRequest("verify", { challengeToken: credentials.current.challengeToken, otp: code.join("") });
      const resetExpiresAt = Date.parse(data.resetExpiresAt);
      if (!validResetToken(data.resetToken) || !Number.isFinite(resetExpiresAt)) throw new Error(ui.tokenError);
      credentials.current = { phone: fullPhone, resetToken: data.resetToken };
      setDeadlines((previous) => ({ ...previous, resetExpiresAt })); setNow(Date.now());
      setCode(Array(CODE_LENGTH).fill("")); changeStep("password");
    } catch (error) { setErrors({ code: resetError(error) }); }
    finally { submitting.current = false; setBusy(false); }
  }

  async function resend() {
    if (seconds > 0 || submitting.current) return;
    submitting.current = true; setBusy(true); setErrors({});
    try {
      const data = await resetRequest("resend", { challengeToken: credentials.current.challengeToken });
      setDeadlines((previous) => ({ ...previous, ...resetDeadlines(data) })); setNow(Date.now());
      setCode(Array(CODE_LENGTH).fill("")); inputs.current[0]?.focus();
    } catch (error) {
      if (Number.isFinite(error.retryAfter)) setDeadlines((previous) => ({ ...previous, resendAt: Date.now() + error.retryAfter * 1000 }));
      setErrors({ code: resetError(error) });
    } finally { submitting.current = false; setBusy(false); }
  }

  async function savePassword(event) {
    event.preventDefault();
    if (submitting.current) return;
    const next = {};
    const passwordIssue = registrationPasswordError(password);
    if (passwordIssue) next.password = passwordIssue;
    if (!confirmation || confirmation !== password) next.confirmation = ui.passwordMismatch;
    if (credentials.current.phone !== fullPhone || !credentials.current.resetToken || resetExpired) next.submit = ui.resetExpired;
    setErrors(next);
    if (Object.keys(next).length) return;
    submitting.current = true;
    setBusy(true);
    try {
      await resetRequest("complete", { resetToken: credentials.current.resetToken, password });
      credentials.current = {};
      // The server has already revoked old JWTs. A browser-storage failure
      // must not turn a completed reset into a retry with a consumed token.
      try { if (getSession()?.phone === fullPhone) clearSession(); } catch { /* Server-side revocation remains authoritative. */ }
      setPassword("");
      setConfirmation("");
      setCode(Array(CODE_LENGTH).fill(""));
      changeStep("done");
    } catch (error) {
      setErrors({ submit: resetError(error) });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <>
    <AuthLayout className={`au-page--entry au-page--recovery${step === "code" ? " au-page--otp" : ""}`}>
      <div className="au-recovery-back">
        {step === "phone" || step === "done" ? <Link to={siteLocalePath("/login", lang)} className="au-link-back"><ArrowIcon direction="left" /> {ui.backLogin}</Link> : <button type="button" className="au-link-back" disabled={busy} onClick={() => { credentials.current = {}; setPassword(""); setConfirmation(""); changeStep("phone"); }}><ArrowIcon direction="left" /> {ui.back}</button>}
      </div>
      <h1 className="au-title" tabIndex={-1} ref={heading}>{ui.titles[step]}</h1>
      {step === "phone" && <>
        <p className="au-sub">{ui.phoneIntro}</p>
        <TelegramOtpNotice />
        <form className="au-form" onSubmit={requestCode} noValidate aria-busy={busy}>
          <fieldset className="au-registration-fields" disabled={busy}>
          <PhoneField value={phone} error={errors.phone} onChange={(value) => { setPhone(value); setErrors({}); }} />
          </fieldset>
          <button type="submit" className="au-btn" disabled={busy}>{busy ? ui.sending : ui.send} <ArrowIcon /></button>
        </form>
      </>}
      {step === "code" && <>
        <p className="au-sub" id="reset-code-description"><b>+998 {phone}</b> {ui.codeIntro}</p>
        <form className="au-otp-form" onSubmit={verifyCode} noValidate aria-busy={busy}>
          <div className={`au-otp${errors.code ? " is-error" : ""}`} role="group" aria-label={ui.codeLabel}>
            {code.map((digit, index) => <input key={index} ref={(element) => { inputs.current[index] = element; }} value={digit} disabled={busy} className={digit ? "is-filled" : ""} type="text" inputMode="numeric" autoComplete={index === 0 ? "one-time-code" : "off"} maxLength={CODE_LENGTH} aria-label={`${index + 1}-${ui.digit}`} aria-invalid={!!errors.code} aria-describedby={`reset-code-description${errors.code ? " reset-code-error" : ""}`} onChange={(event) => enterCode(index, event.target.value)} onPaste={(event) => { event.preventDefault(); enterCode(index, event.clipboardData.getData("text")); }} onFocus={(event) => event.target.select()} onKeyDown={(event) => {
              if (event.key === "Backspace" && !digit && index > 0) { event.preventDefault(); setCode((previous) => previous.map((value, position) => position === index - 1 ? "" : value)); setErrors({}); inputs.current[index - 1]?.focus(); }
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); inputs.current[Math.max(0, Math.min(CODE_LENGTH - 1, index + (event.key === "ArrowLeft" ? -1 : 1)))]?.focus(); }
            }} />)}
          </div>
          {expired && !errors.code && <p className="au-error au-center" role="status">{ui.expired}</p>}
          {errors.code && <p className="au-error au-center" id="reset-code-error" role="alert">{errors.code}</p>}
          <button type="submit" className="au-btn" disabled={busy || expired || code.some((digit) => !digit)}>{ui.verify} <ArrowIcon /></button>
        </form>
        <div className="au-foot">
          <button type="button" className="au-text-btn" disabled={busy || seconds > 0} onClick={resend}>{seconds > 0 ? `${ui.resend} (${seconds}s)` : ui.resend}</button>
          <button type="button" className="au-text-btn au-otp-help" onClick={() => helpDialog.current?.showModal()} aria-haspopup="dialog">{ui.noCode}</button>
        </div>
      </>}
      {step === "password" && <>
        <p className="au-sub">{ui.passwordIntro}</p>
        {resetExpired && <p className="au-error" role="alert">{ui.resetExpiredHelp}</p>}
        <form className="au-form" onSubmit={savePassword} noValidate aria-busy={busy}>
          <fieldset className="au-registration-fields" disabled={busy}>
            <PasswordField signup maxLength={128} hint={lang === "uz" ? REGISTRATION_PASSWORD_HINT : ui.passwordPolicy} value={password} error={errors.password} onChange={(value) => { setPassword(value); setErrors({}); }} />
            <PasswordField confirmation maxLength={128} value={confirmation} error={errors.confirmation} matchState={confirmation ? password === confirmation ? "match" : "mismatch" : null} onChange={(value) => { setConfirmation(value); setErrors({}); }} />
          </fieldset>
          {errors.submit && <p className="au-error" role="alert">{errors.submit}</p>}
          <button type="submit" className="au-btn" disabled={busy || resetExpired}>{busy ? ui.saving : ui.save}</button>
        </form>
      </>}
      {step === "done" && <>
        <p className="au-sub" role="status">{ui.doneIntro}</p>
        <Link to={siteLocalePath("/login", lang)} state={{ phone, passwordReset: true }} className="au-btn">{ui.login} <ArrowIcon /></Link>
      </>}
    </AuthLayout>
    <dialog ref={helpDialog} className="au-help-dialog" aria-labelledby="reset-help-title">
      <h2 id="reset-help-title">{ui.noCode}</h2>
      <p>{ui.helpIntro}</p>
      <p>{ui.helpBack}</p>
      <p><Link to={siteLocalePath("/account-recovery", lang)}>{ui.accountRecovery}</Link></p>
      <form method="dialog"><button type="submit" className="au-btn">{ui.understood}</button></form>
    </dialog>
    </>
  );
}
