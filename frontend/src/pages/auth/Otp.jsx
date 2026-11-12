import ArrowIcon from "../../components/ArrowIcon";
import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { savePasswordRecord } from "./credentials";
import { readCustomerProfile, saveCustomerProfile } from "../user/data/profile";
import { createAccount } from "../barber/data/store";
import { AuthLayout } from "./components/AuthParts";
import { formatPhone } from "./utils/phone";
import { getAccount, isValidPhone, setSession } from "./utils/session";
import "./auth-ui.css";

const LENGTH = 5;
const RESEND_SECONDS = 60;
const TEST_CODE = "12345"; // Local demo only; no SMS is sent.

export default function Otp() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [code, setCode] = useState(Array(LENGTH).fill(""));
  const codeRef = useRef(code);
  const [status, setStatus] = useState("idle");
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [resendCycle, setResendCycle] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const refs = useRef([]);
  const finished = useRef(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    const deadline = Date.now() + RESEND_SECONDS * 1000;
    const refresh = () =>
      setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    const timer = window.setInterval(refresh, 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [resendCycle]);

  useEffect(() => {
    refs.current[0]?.focus({ preventScroll: true });
  }, []);

  if (
    !isValidPhone(state?.phone) ||
    !["customer", "barber", "login"].includes(state?.role)
  ) {
    return <Navigate to="/signup" replace />;
  }

  function finish() {
    const { phone, role } = state;
    if (role !== "login" && state.passwordRecord)
      savePasswordRecord(phone, state.passwordRecord);
    if (role === "barber") {
      createAccount({
        nameConfirmed: false,
        firstName: "",
        lastName: "",
        phone: `+998 ${formatPhone(phone.slice(4))}`,
        avatar: null,
        avatarPhoto: "",
        specialty: state.specialty,
        salonName: "",
      });
      setSession({ role, phone, setupDone: false, authenticated: true });
    } else if (role === "customer") {
      saveCustomerProfile(phone, {
        ...readCustomerProfile(phone),
        nameConfirmed: false,
      });
      setSession({ role, phone, authenticated: true });
    } else {
      const account = getAccount();
      if (!account || account.phone !== phone) {
        navigate("/login", { replace: true });
        return;
      }
      setSession({ ...account, authenticated: true });
    }
    navigate("/complete-profile", { replace: true });
  }

  function verify(digits) {
    if (finished.current || digits.length !== LENGTH || !digits.every(Boolean))
      return;
    setSubmitError("");
    if (digits.join("") !== TEST_CODE) {
      setStatus("error");
      return;
    }
    finished.current = true;
    try {
      finish();
    } catch {
      finished.current = false;
      setSubmitError(
        "Sessiyani saqlab bo‘lmadi. Brauzer xotirasini tekshirib, qayta urinib ko‘ring.",
      );
      setStatus("error");
    }
  }

  function updateCode(next) {
    codeRef.current = next;
    setCode(next);
    setStatus("idle");
    setSubmitError("");
  }

  function enterDigits(index, value) {
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

  function handleResend() {
    if (seconds > 0 || finished.current) return;
    setResendCycle((cycle) => cycle + 1);
    setSeconds(RESEND_SECONDS);
    updateCode(Array(LENGTH).fill(""));
    refs.current[0]?.focus();
    // Local demo: keep the test code. The user will implement real SMS later.
  }

  return (
    <>
      <AuthLayout className="au-page--otp">
        <button
          type="button"
          className="au-link-back"
          onClick={() => navigate(-1)}
        >
          <ArrowIcon direction="left" /> Orqaga
        </button>
        <h1 className="au-title">Tasdiqlash kodi</h1>
        <p className="au-sub" id="otp-description">
          <b>+998 {formatPhone(state.phone.slice(4))}</b> uchun {LENGTH} xonali
          test kodini kiriting. SMS hozircha yuborilmaydi.
        </p>
        <form
          className="au-otp-form"
          onSubmit={(event) => {
            event.preventDefault();
            verify(codeRef.current);
          }}
          noValidate
        >
          <div
            className={`au-otp${status === "error" ? " is-error" : ""}`}
            role="group"
            aria-label="Tasdiqlash kodi"
          >
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(element) => {
                  refs.current[index] = element;
                }}
                className={digit ? "is-filled" : ""}
                type="text"
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
                aria-label={`${index + 1}-raqam`}
                aria-invalid={status === "error"}
                aria-describedby={`otp-description${status === "error" ? " otp-error" : ""}`}
              />
            ))}
          </div>
          {status === "error" && (
            <p className="au-error au-center" id="otp-error" role="alert">
              {submitError || "Kod noto‘g‘ri. Qayta urinib ko‘ring."}
            </p>
          )}
          <button
            type="submit"
            className="au-btn"
            disabled={!code.every(Boolean)}
          >
            Tasdiqlash <ArrowIcon />
          </button>
        </form>
        <div className="au-foot">
          <button
            type="button"
            className="au-text-btn"
            disabled={seconds > 0}
            onClick={() => handleResend()}
          >
            {seconds > 0 ? `Qayta yuborish (${seconds}s)` : "Qayta yuborish"}
          </button>
          <button
            type="button"
            className="au-text-btn au-otp-help"
            onClick={() => setShowHelp(true)}
            aria-haspopup="dialog"
          >
            Kod kelmadimi?
          </button>
        </div>
      </AuthLayout>
      {showHelp && (
        <div className="au-help-overlay">
          <div className="au-help-modal">
            <h3>Kod kelmadimi?</h3>

            <p>
              SMS xabari kelishi biroz vaqt olishi mumkin. Quyidagilarni
              tekshirib ko‘ring:
            </p>

            <ul>
              <li>Telefon raqamingiz to‘g‘ri kiritilganmi?</li>
              <li>Telefoningiz tarmoq signaliga egami?</li>
              <li>SMS xabarlar bloklanmaganmi?</li>
            </ul>

            <button type="button" onClick={() => setShowHelp(false)}>
              Tushunarli
            </button>
          </div>
        </div>
      )}
    </>
  );
}
