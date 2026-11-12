import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import ArrowIcon from "../../components/ArrowIcon";
import { AuthLayout, PhoneField } from "./components/AuthParts";
import PasswordField from "./components/PasswordField";
import { createPasswordRecord, savePasswordRecord, validPassword } from "./credentials";
import { clearSession, getAccount, getSession } from "./utils/session";
import { formatPhone } from "./utils/phone";
import "./auth-ui.css";

// TODO: replace the local challenge with server-issued SMS verification and reset tokens.
const TEST_CODE = "12345";
const CODE_LENGTH = TEST_CODE.length;
const TITLES = { phone: "Parolni tiklash", code: "Tasdiqlash kodi", password: "Yangi parol", done: "Parol yangilandi" };

export default function ForgotPassword() {
  const location = useLocation();
  const [phone, setPhone] = useState(() => formatPhone(typeof location.state?.phone === "string" ? location.state.phone : ""));
  const [step, setStep] = useState("phone");
  const [code, setCode] = useState(Array(CODE_LENGTH).fill(""));
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState({});
  const [seconds, setSeconds] = useState(60);
  const [resendCycle, setResendCycle] = useState(0);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const verifiedPhone = useRef(null);
  const submitting = useRef(false);
  const inputs = useRef([]);
  const heading = useRef(null);
  const helpDialog = useRef(null);
  const fullPhone = "+998" + phone.replace(/\D/g, "");

  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => {
    if (step !== "code") return;
    const deadline = Date.now() + 60000;
    const refresh = () => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    const interval = window.setInterval(refresh, 1000);
    const expiration = window.setTimeout(() => setExpired(true), 300000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(expiration);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [step, resendCycle]);

  function changeStep(next) {
    setErrors({});
    setStep(next);
  }

  function requestCode(event) {
    event.preventDefault();
    if (phone.replace(/\D/g, "").length !== 9) {
      setErrors({ phone: "Telefon raqamni to‘liq kiriting (9 ta raqam)." });
      return;
    }
    if (getAccount()?.phone !== fullPhone) {
      setErrors({ phone: "Bu raqamga tegishli hisob topilmadi. Ro‘yxatdan o‘tgan raqamingizni kiriting." });
      return;
    }
    verifiedPhone.current = null;
    setCode(Array(CODE_LENGTH).fill(""));
    setSeconds(60);
    setExpired(false);
    changeStep("code");
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

  function verifyCode(event) {
    event.preventDefault();
    if (expired) return setErrors({ code: "Kod muddati tugadi. Qayta kod so‘rang." });
    if (code.join("") !== TEST_CODE) return setErrors({ code: "Kod noto‘g‘ri. Qayta tekshiring." });
    if (getAccount()?.phone !== fullPhone) return setErrors({ code: "Hisob o‘zgargan. Telefon raqamingizni qayta kiriting." });
    verifiedPhone.current = fullPhone;
    changeStep("password");
  }

  function resend() {
    if (seconds > 0) return;
    setCode(Array(CODE_LENGTH).fill(""));
    setErrors({});
    setSeconds(60);
    setExpired(false);
    setResendCycle((cycle) => cycle + 1);
    inputs.current[0]?.focus();
  }

  async function savePassword(event) {
    event.preventDefault();
    if (submitting.current) return;
    const next = {};
    if (!validPassword(password)) next.password = "Kamida 8 ta raqam va 1 ta lotin harfi kiriting. Bo‘sh joy ishlatmang.";
    if (!confirmation || confirmation !== password) next.confirmation = "Parollar mos emas. Qayta tekshiring.";
    if (verifiedPhone.current !== fullPhone || getAccount()?.phone !== fullPhone) next.submit = "Avval telefon raqamingizni tasdiqlang.";
    setErrors(next);
    if (Object.keys(next).length) return;
    submitting.current = true;
    setBusy(true);
    try {
      const record = await createPasswordRecord(password);
      if (getAccount()?.phone !== fullPhone) throw new Error("Account changed");
      savePasswordRecord(fullPhone, record);
      if (getSession()?.phone === fullPhone) clearSession();
      verifiedPhone.current = null;
      setPassword("");
      setConfirmation("");
      setCode(Array(CODE_LENGTH).fill(""));
      changeStep("done");
    } catch {
      setErrors({ submit: "Parolni saqlab bo‘lmadi. Qayta urinib ko‘ring." });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <>
    <AuthLayout className={`au-page--entry au-page--recovery${step === "code" ? " au-page--otp" : ""}`}>
      <div className="au-recovery-back">
        {step === "phone" || step === "done" ? <Link to="/login" className="au-link-back"><ArrowIcon direction="left" /> Kirishga qaytish</Link> : <button type="button" className="au-link-back" disabled={busy} onClick={() => { verifiedPhone.current = null; setPassword(""); setConfirmation(""); changeStep("phone"); }}><ArrowIcon direction="left" /> Orqaga</button>}
      </div>
      <h1 className="au-title" tabIndex={-1} ref={heading}>{TITLES[step]}</h1>
      {step === "phone" && <>
        <p className="au-sub">Hisobingizga bog‘langan telefon raqamni kiriting.</p>
        <form className="au-form" onSubmit={requestCode} noValidate>
          <PhoneField value={phone} error={errors.phone} onChange={(value) => { setPhone(value); setErrors({}); }} />
          <button type="submit" className="au-btn">Kod olish <ArrowIcon /></button>
        </form>
      </>}
      {step === "code" && <>
        <p className="au-sub" id="reset-code-description"><b>+998 {phone}</b> uchun 5 xonali test kodini kiriting. SMS hozircha yuborilmaydi.</p>
        <form className="au-otp-form" onSubmit={verifyCode} noValidate>
          <div className={`au-otp${errors.code ? " is-error" : ""}`} role="group" aria-label="Tasdiqlash kodi">
            {code.map((digit, index) => <input key={index} ref={(element) => { inputs.current[index] = element; }} value={digit} className={digit ? "is-filled" : ""} type="text" inputMode="numeric" autoComplete={index === 0 ? "one-time-code" : "off"} maxLength={CODE_LENGTH} aria-label={`${index + 1}-raqam`} aria-invalid={!!errors.code} aria-describedby={`reset-code-description${errors.code ? " reset-code-error" : ""}`} onChange={(event) => enterCode(index, event.target.value)} onPaste={(event) => { event.preventDefault(); enterCode(index, event.clipboardData.getData("text")); }} onFocus={(event) => event.target.select()} onKeyDown={(event) => {
              if (event.key === "Backspace" && !digit && index > 0) { event.preventDefault(); setCode((previous) => previous.map((value, position) => position === index - 1 ? "" : value)); setErrors({}); inputs.current[index - 1]?.focus(); }
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); inputs.current[Math.max(0, Math.min(CODE_LENGTH - 1, index + (event.key === "ArrowLeft" ? -1 : 1)))]?.focus(); }
            }} />)}
          </div>
          {errors.code && <p className="au-error au-center" id="reset-code-error" role="alert">{errors.code}</p>}
          <button type="submit" className="au-btn" disabled={code.some((digit) => !digit)}>Tasdiqlash <ArrowIcon /></button>
        </form>
        <div className="au-foot">
          <button type="button" className="au-text-btn" disabled={seconds > 0} onClick={resend}>{seconds > 0 ? `Qayta yuborish (${seconds}s)` : "Qayta yuborish"}</button>
          <button type="button" className="au-text-btn au-otp-help" onClick={() => helpDialog.current?.showModal()} aria-haspopup="dialog">Kod kelmadimi?</button>
        </div>
      </>}
      {step === "password" && <>
        <p className="au-sub">Yangi parolingizni yarating va takrorlang.</p>
        <form className="au-form" onSubmit={savePassword} noValidate aria-busy={busy}>
          <fieldset className="au-registration-fields" disabled={busy}>
            <PasswordField signup value={password} error={errors.password} onChange={(value) => { setPassword(value); setErrors({}); }} />
            <PasswordField confirmation value={confirmation} error={errors.confirmation} matchState={confirmation ? password === confirmation ? "match" : "mismatch" : null} onChange={(value) => { setConfirmation(value); setErrors({}); }} />
          </fieldset>
          {errors.submit && <p className="au-error" role="alert">{errors.submit}</p>}
          <button type="submit" className="au-btn" disabled={busy}>{busy ? "Saqlanmoqda…" : "Parolni saqlash"}</button>
        </form>
      </>}
      {step === "done" && <>
        <p className="au-sub" role="status">Endi yangi parolingiz bilan hisobingizga kirishingiz mumkin.</p>
        <Link to="/login" state={{ phone, passwordReset: true }} className="au-btn">Kirish <ArrowIcon /></Link>
      </>}
    </AuthLayout>
    <dialog ref={helpDialog} className="au-help-dialog" aria-labelledby="reset-help-title">
      <h2 id="reset-help-title">Kod kelmadimi?</h2>
      <p>Hozir sinov rejimi ishlayapti, SMS yuborilmaydi. Davom etish uchun quyidagi kodni kiriting.</p>
      <p className="au-help-code" aria-label={`Sinov kodi: ${TEST_CODE}`}>{TEST_CODE}</p>
      <p>Raqam xato bo‘lsa, «Orqaga» tugmasi orqali uni tuzating.</p>
      <form method="dialog"><button type="submit" className="au-btn">Tushunarli</button></form>
    </dialog>
    </>
  );
}
