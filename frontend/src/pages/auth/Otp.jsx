import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { createAccount } from "../barber/data/store";
import { AuthLayout } from "./components/AuthParts";
import { formatPhone } from "./utils/phone";
import { getSession, setSession } from "./utils/session";
import "./auth-ui.css";

const LENGTH = 5;
const RESEND_SECONDS = 60;
const TEST_CODE = "12345"; // MOCK: the backend will send and check the real code

export default function Otp() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const [code, setCode] = useState(Array(LENGTH).fill(""));
  const [status, setStatus] = useState("idle"); // idle | error
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const refs = useRef([]);

  // Resend countdown
  useEffect(() => {
    if (seconds === 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  // Focus the first cell
  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  // Opened directly (no phone in state) -> back to sign-up
  if (!state?.phone) return <Navigate to="/signup" replace />;

  // Code is correct: create / restore the account and go to the right page
  const finish = () => {
    const { phone, role } = state;

    if (role === "barber") {
      const [firstName, ...rest] = state.name.trim().split(/\s+/);
      createAccount({
        firstName,
        lastName: rest.join(" "),
        phone: `+998 ${formatPhone(phone.slice(4))}`,
        avatar: state.avatar,
        specialty: state.specialty,
        salonName: `${firstName} Barber`,
      });
      setSession({ role, phone, setupDone: false });
      navigate("/barber/setup", { replace: true });
    } else if (role === "customer") {
      setSession({ role, phone });
      navigate("/", { replace: true });
    } else {
      // Sign in: send the person where they belong
      const session = getSession();
      const target =
        session?.role === "barber" ? (session.setupDone ? "/barber" : "/barber/setup") : "/";
      navigate(target, { replace: true });
    }
  };

  const verify = (digits) => {
    if (digits.join("") === TEST_CODE) finish();
    else setStatus("error");
  };

  const handleChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    setStatus("idle");
    if (digit && index < LENGTH - 1) refs.current[index + 1].focus();
    if (next.every(Boolean)) verify(next);
  };

  const handleKeyDown = (index, event) => {
    if (event.key === "Backspace" && !code[index] && index > 0) {
      refs.current[index - 1].focus();
    }
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;

    const next = Array(LENGTH).fill("");
    pasted.split("").forEach((digit, i) => (next[i] = digit));
    setCode(next);
    setStatus("idle");
    refs.current[Math.min(pasted.length, LENGTH - 1)].focus();
    if (pasted.length === LENGTH) verify(next);
  };

  const handleResend = () => {
    setSeconds(RESEND_SECONDS);
    setCode(Array(LENGTH).fill(""));
    setStatus("idle");
    refs.current[0]?.focus();
    // TODO: ask the backend to send a new code
  };

  return (
    <AuthLayout>
      <button type="button" className="au-link-back" onClick={() => navigate(-1)}>
        ← Orqaga
      </button>

      <h1 className="au-title">Kodni kiriting</h1>
      <p className="au-sub">
        <b>+998 {formatPhone(state.phone.slice(4))}</b> raqamiga {LENGTH} xonali kod
        yuborildi.
      </p>

      <div className={`au-otp ${status === "error" ? "is-error" : ""}`}>
        {code.map((digit, i) => (
          <input
            key={i}
            ref={(el) => (refs.current[i] = el)}
            className={digit ? "is-filled" : ""}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={digit}
            onChange={(event) => handleChange(i, event.target.value)}
            onKeyDown={(event) => handleKeyDown(i, event)}
            onPaste={handlePaste}
            onFocus={(event) => event.target.select()}
            aria-label={`${i + 1}-raqam`}
          />
        ))}
      </div>

      {status === "error" && (
        <p className="au-error au-center" role="alert">
          Kod noto'g'ri. Qayta urinib ko'ring.
        </p>
      )}

      <button
        type="button"
        className="au-btn"
        disabled={!code.every(Boolean)}
        onClick={() => verify(code)}
      >
        Tasdiqlash <span aria-hidden="true">→</span>
      </button>

      <p className="au-foot">
        Kod kelmadimi?{" "}
        <button type="button" className="au-text-btn" disabled={seconds > 0} onClick={handleResend}>
          {seconds > 0 ? `Qayta yuborish (${seconds}s)` : "Qayta yuborish"}
        </button>
      </p>

      {import.meta.env.DEV && (
        <p className="au-dev">Test rejimi: kod <b>{TEST_CODE}</b></p>
      )}
    </AuthLayout>
  );
}
