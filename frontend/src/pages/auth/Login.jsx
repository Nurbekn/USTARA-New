import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout, PhoneField } from "./components/AuthParts";
import { getAccount, setSession } from "./utils/session";
import "./auth-ui.css";
import PasswordField from "./components/PasswordField";
import { hasPasswordRecord, verifyPassword } from "./credentials";

// Local test login verifies the stored password and restores the existing session.
export default function Login() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setPasswordError("");
    const digits = phone.replace(/\D/g, "");
    const full = "+998" + digits;

    if (digits.length !== 9) {
      setError("Telefon raqamni to'liq kiriting (9 ta raqam)");
      return;
    }

    // MOCK check: only accounts created in this browser exist.
    // Replace with an API call when the backend is ready.
    const account = getAccount();
    if (account?.phone !== full) {
      setNotFound(true);
      return;
    }
    setBusy(true);
    try {
      if (!hasPasswordRecord(full)) {
        setPasswordError("Bu hisobda parol hali yaratilmagan. Ro‘yxatdan o‘tish orqali parol yarating.");
        return;
      }
      // Login checks the saved password, not the current sign-up format rules.
      if (!await verifyPassword(full, password)) {
        setPasswordError("Parol noto‘g‘ri. Qayta kiriting.");
        return;
      }
      setSession({ ...account, authenticated: true });
      navigate("/complete-profile", { replace: true });
    } catch {
      setPasswordError("Kirishni tekshirib bo‘lmadi. Qayta urinib ko‘ring.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout className="au-page--entry">
      <h1 className="au-title">Kirish</h1>
      <p className="au-sub">Telefon raqamingiz va yaratgan parolingiz bilan kiring.</p>

      <form className="au-form" onSubmit={handleSubmit} noValidate>
        <PhoneField
          value={phone}
          error={error}
          onChange={(value) => {
            setPhone(value);
            setError("");
            setNotFound(false);
            setPasswordError("");
          }}
        />

        <PasswordField value={password} error={passwordError} onChange={(value) => { setPassword(value); setPasswordError(""); }} />

        {notFound && (
          <p className="au-error" role="alert">
            Bu raqam ro'yxatdan o'tmagan. <Link to="/signup">Ro'yxatdan o'ting</Link>
          </p>
        )}

        <button type="submit" className="au-btn" disabled={busy}>
          {busy ? "Tekshirilmoqda…" : "Kirish"}
        </button>
      </form>

      <p className="au-foot">
        Hisobingiz yo'qmi? <Link to="/signup">Ro'yxatdan o'tish</Link>
      </p>
    </AuthLayout>
  );
}
