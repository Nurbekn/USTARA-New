import ArrowIcon from "../../components/ArrowIcon";
import SiteLanguageSelect from "../../components/SiteLanguageSelect.jsx";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, Navigate, useNavigate, useLocation } from "react-router-dom";
import { siteLocalePath } from "../../utils/siteLocale.js";
import { authLocale, authUi, localizedOtpError } from "./authLocale.js";
import { AuthLayout } from "./components/AuthParts";
import { clearRegistration, getRegistration, subscribeRegistration, registrationBlocked, registrationDeadline, otpError, verifyRegistration, resendRegistration, refreshRegistration } from "./utils/registration";
import "./auth-ui.css";

const LENGTH = 5;

export default function Otp() {
  const pending = useSyncExternalStore(subscribeRegistration, getRegistration, () => null);
  const navigate = useNavigate();
  const location = useLocation();
  const lang = authLocale(location.search);
  const ui = authUi(lang);
  const [code, setCode] = useState(Array(LENGTH).fill(""));
  const codeRef = useRef(code);
  const [status, setStatus] = useState("idle");
  const [now, setNow] = useState(Date.now);
  const [entryRole] = useState(pending?.role || "customer");
  const refs = useRef([]);
  const inFlight = useRef(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    refs.current[0]?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!pending?.sessionToken || pending.stage !== 'otp') return;
    let active = true;
    let running = false;
    const refresh = async () => {
      if (running || inFlight.current || document.visibilityState === 'hidden' || getRegistration()?.retryAt > Date.now()) return;
      running = true;
      try { await refreshRegistration(); }
      catch (error) { if (active && error.code) setSubmitError(lang === "uz" ? otpError(error) : localizedOtpError(error, lang)); }
      finally { running = false; }
    };
    refresh();
    const timer = pending.deliveryPending ? window.setInterval(refresh, 3000) : null;
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
  }, [pending?.sessionToken, pending?.deliveryPending, pending?.stage, lang]);

  const waiting = pending?.deliveryPending === true;
  const busy = status === "verifying" || status === "resending";
  const resendDeadline = Math.max(pending?.resendAt || 0, pending?.retryAt || 0);
  const seconds = Math.max(0, Math.ceil((resendDeadline - now) / 1000));
  const expired = pending && registrationDeadline(pending) <= now;
  const countdown = (time) => `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`;
  const blocked = registrationBlocked(pending, now);
  const otpExpired = pending && !waiting && pending.otpExpiresAt <= now;
  const signupPath = siteLocalePath((pending?.role || entryRole) === "barber" ? "/signup/sartarosh" : "/signup", lang);

  async function verify(digits) {
    if (inFlight.current || !pending || expired || blocked || otpExpired
      || digits.length !== LENGTH || !digits.every((digit) => /^\d$/.test(digit))) return;
    inFlight.current = true;
    setStatus("verifying");
    setSubmitError("");
    try {
      await verifyRegistration(digits.join(""));
      navigate(siteLocalePath("/complete-profile", lang), { replace: true });
    } catch (error) {
      if (error.code === "invalid_otp") {
        codeRef.current = Array(LENGTH).fill("");
        setCode(codeRef.current);
        window.requestAnimationFrame(() => refs.current[0]?.focus());
      }
      setSubmitError(lang === "uz" ? otpError(error) : localizedOtpError(error, lang));
      setStatus("error");
    } finally { inFlight.current = false; }
  }

  function updateCode(next) {
    codeRef.current = next;
    setCode(next);
    setStatus("idle");
    setSubmitError("");
  }

  function enterDigits(index, value) {
    if (inFlight.current) return;
    const digits = value.replace(/\D/g, "").slice(0, LENGTH);
    if (value && !digits) return;
    const start = digits.length === LENGTH ? 0 : index;
    const next = [...codeRef.current];
    if (!digits) next[index] = "";
    else
      [...digits].forEach((digit, offset) => {
        if (start + offset < LENGTH) next[start + offset] = digit;
      });
    updateCode(next);
    if (digits)
      refs.current[Math.min(start + digits.length, LENGTH - 1)]?.focus();
    if (next.every(Boolean)) verify(next);
  }

  function handleKeyDown(index, event) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const offset = event.key === "ArrowLeft" ? -1 : 1;
      refs.current[Math.max(0, Math.min(index + offset, LENGTH - 1))]?.focus();
    } else if (
      event.key === "Backspace" &&
      !codeRef.current[index] &&
      index > 0
    ) {
      event.preventDefault();
      const next = [...codeRef.current];
      next[index - 1] = "";
      updateCode(next);
      refs.current[index - 1]?.focus();
    }
  }

  async function handleResend() {
    if (inFlight.current || seconds > 0 || expired || blocked) return;
    inFlight.current = true;
    setStatus("resending");
    setSubmitError("");
    try {
      await resendRegistration();
      setNow(Date.now);
      updateCode(Array(LENGTH).fill(""));
      refs.current[0]?.focus();
    } catch (error) {
      setSubmitError(lang === "uz" ? otpError(error) : localizedOtpError(error, lang));
      setStatus("error");
    } finally { inFlight.current = false; }
  }

  if (!pending) return <AuthLayout className="au-page--otp"><h1 className="au-title">{ui.missingSession}</h1><p className="au-sub" role="alert">{submitError || ui.missingSessionHelp}</p><Link className="au-btn" to={signupPath}>{ui.restart}</Link></AuthLayout>;
  if (pending.stage !== "otp") return <Navigate to={siteLocalePath("/complete-profile", lang)} replace />;

  return (
      <AuthLayout className="au-page--otp">
        <SiteLanguageSelect className="au-otp-language" />
        <button
          type="button"
          className="au-link-back"
          disabled={busy}
          onClick={() => navigate(signupPath)}
        >
          <ArrowIcon direction="left" /> {ui.back}
        </button>
        <h1 className="au-title">{ui.otpTitle}</h1>
        <p className="au-sub au-otp-intro" id="otp-description">
          <b>{pending.phone.replace(/^(\+998)(\d{2})(\d{3})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5")}</b>
        </p>
        {!expired && !blocked && <a className="au-btn au-otp-telegram" href="https://t.me/ustara_booking_bot">{ui.openBot}</a>}
        <form
          className="au-otp-form"
          onSubmit={(event) => {
            event.preventDefault();
            verify(codeRef.current);
          }}
          noValidate
          aria-busy={busy}
        >
          <div
            className={`au-otp${status === "error" ? " is-error" : ""}`}
            role="group"
            aria-label={ui.otpTitle}
          >
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(element) => {
                  refs.current[index] = element;
                }}
                className={digit ? "is-filled" : ""}
                type="text"
                disabled={busy}
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                maxLength={LENGTH}
                value={digit}
                onChange={(event) => enterDigits(index, event.target.value)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={(event) => {
                  event.preventDefault();
                  enterDigits(index, event.clipboardData.getData("text"));
                }}
                onFocus={(event) => event.target.select()}
                aria-label={`${index + 1} ${ui.otpDigit}`}
                aria-invalid={status === "error"}
                aria-describedby={`otp-description${status === "error" ? " otp-error" : ""}`}
              />
            ))}
          </div>
          {(status === "error" || submitError || expired || blocked || otpExpired) && (
            <p className="au-error au-center" id="otp-error" role="alert">
              {submitError || (blocked ? ui.blocked : expired ? ui.sessionExpired : ui.codeExpired)}
            </p>
          )}
          <button
            type="submit"
            className="au-btn"
            disabled={busy || expired || blocked || otpExpired || !code.every(Boolean)}
          >
            {status === "verifying" ? ui.check : ui.verify} <ArrowIcon />
          </button>
        </form>
        <div className="au-foot">
          <button
            type="button"
            className="au-text-btn au-otp-resend"
            disabled={busy || seconds > 0 || expired || blocked}
            onClick={handleResend}
          >
            {status === "resending" ? ui.resending : <>
              <span>{ui.resend}</span>
              {seconds > 0 && <span className="au-otp-countdown" role="timer" aria-label={ui.resendCountdown}>{countdown(seconds)}</span>}
            </>}
          </button>
        </div>
        {expired && <p className="au-foot"><Link to={signupPath} onClick={clearRegistration}>{ui.restartSignup}</Link></p>}
      </AuthLayout>
  );
}
