import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout, PhoneField, RoleSwitch } from "./components/AuthParts";
import "./auth-ui.css";

// Customer sign-up: phone number -> OTP code
export default function Signup() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    const digits = phone.replace(/\D/g, "");

    if (digits.length !== 9) {
      setError("Telefon raqamni to'liq kiriting (9 ta raqam)");
      return;
    }
    navigate("/otp", { state: { phone: "+998" + digits, role: "customer" } });
  };

  return (
    <AuthLayout>
      <RoleSwitch role="customer" />

      <h1 className="au-title">Ro'yxatdan o'ting</h1>
      <p className="au-sub">Telefon raqamingizga tasdiqlash kodini yuboramiz.</p>

      <form className="au-form" onSubmit={handleSubmit} noValidate>
        <PhoneField
          value={phone}
          error={error}
          onChange={(value) => {
            setPhone(value);
            setError("");
          }}
        />
        <button type="submit" className="au-btn">
          Kod olish <span aria-hidden="true">→</span>
        </button>
      </form>

      <p className="au-foot">
        Hisobingiz bormi? <Link to="/login">Kirish</Link>
      </p>
    </AuthLayout>
  );
}
