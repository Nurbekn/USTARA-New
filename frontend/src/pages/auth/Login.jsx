import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout, PhoneField } from "./components/AuthParts";
import { getSession } from "./utils/session";
import "./auth-ui.css";

// Sign in: same phone + OTP flow as sign-up (no passwords on the platform)
export default function Login() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    const digits = phone.replace(/\D/g, "");
    const full = "+998" + digits;

    if (digits.length !== 9) {
      setError("Telefon raqamni to'liq kiriting (9 ta raqam)");
      return;
    }

    // MOCK check: only accounts created in this browser exist.
    // Replace with an API call when the backend is ready.
    if (getSession()?.phone !== full) {
      setNotFound(true);
      return;
    }
    navigate("/otp", { state: { phone: full, role: "login" } });
  };

  return (
    <AuthLayout>
      <h1 className="au-title">Xush kelibsiz!</h1>
      <p className="au-sub">Telefon raqamingiz orqali hisobingizga kiring.</p>

      <form className="au-form" onSubmit={handleSubmit} noValidate>
        <PhoneField
          value={phone}
          error={error}
          onChange={(value) => {
            setPhone(value);
            setError("");
            setNotFound(false);
          }}
        />

        {notFound && (
          <p className="au-error" role="alert">
            Bu raqam ro'yxatdan o'tmagan. <Link to="/signup">Ro'yxatdan o'ting</Link>
          </p>
        )}

        <button type="submit" className="au-btn">
          Kod olish <span aria-hidden="true">→</span>
        </button>
      </form>

      <p className="au-foot">
        Hisobingiz yo'qmi? <Link to="/signup">Ro'yxatdan o'tish</Link>
      </p>
    </AuthLayout>
  );
}
