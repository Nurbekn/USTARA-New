import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout, PhoneField, RoleSwitch } from "./AuthParts";
import PasswordField from "./PasswordField";
import { createPasswordRecord, validPassword } from "../credentials";
import "../auth-ui.css";

const SPECIALTIES = [
  { value: "barber", label: "Sartarosh" },
  { value: "cosmetolog", label: "Kosmetolog" },
  { value: "stylist", label: "Stilist" },
];

export default function RegistrationForm({ role }) {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [specialty, setSpecialty] = useState("barber");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const clear = (field) => setErrors((previous) => ({ ...previous, [field]: "", submit: "" }));

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const digits = phone.replace(/\D/g, "");
    const next = {};
    if (digits.length !== 9) next.phone = "Telefon raqamni to‘liq kiriting (9 ta raqam).";
    if (!validPassword(password)) next.password = "Kamida 8 ta raqam va kamida 1 ta lotin harfi kiriting. Tinish belgisi ixtiyoriy; bo‘sh joy ishlatmang.";
    if (!confirmPassword) next.confirmPassword = "Parolni qayta kiriting.";
    else if (password !== confirmPassword) next.confirmPassword = "Parollar mos kelmadi. Qayta tekshiring.";
    setErrors(next);
    if (Object.keys(next).length) return;
    submitting.current = true;
    setBusy(true);
    try {
      const passwordRecord = await createPasswordRecord(password);
      navigate("/otp", { state: { phone: "+998" + digits, role, passwordRecord, ...(role === "barber" ? { specialty } : {}) } });
    } catch {
      setErrors({ submit: "Davom etib bo‘lmadi. Sahifani HTTPS yoki localhost orqali ochib, qayta urinib ko‘ring." });
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <AuthLayout className="au-page--entry au-page--signup">
      <RoleSwitch role={role} />
      <h1 className="au-title">Ro‘yxatdan o‘tish</h1>
      <p className="au-sub">Telefon raqamingizni kiriting va parol yarating.</p>
      <form className="au-form" onSubmit={submit} noValidate aria-busy={busy}>
        <fieldset className="au-registration-fields" disabled={busy}>
          <PhoneField value={phone} error={errors.phone} onChange={(value) => { setPhone(value); clear("phone"); }} />
          <PasswordField value={password} signup error={errors.password} onChange={(value) => {
            setPassword(value);
            setErrors((previous) => ({ ...previous, password: "", confirmPassword: "", submit: "" }));
          }} />
          <PasswordField value={confirmPassword} confirmation matchState={confirmPassword ? (password === confirmPassword ? "match" : "mismatch") : null} error={errors.confirmPassword} onChange={(value) => { setConfirmPassword(value); clear("confirmPassword"); }} />
          {role === "barber" && <div className="au-field"><label className="au-label" htmlFor="specialty">Mutaxassislik</label><select id="specialty" className="au-input" value={specialty} onChange={(event) => setSpecialty(event.target.value)}>{SPECIALTIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>}
        </fieldset>
        {errors.submit && <p className="au-error" role="alert">{errors.submit}</p>}
        <button type="submit" className="au-btn" disabled={busy}>{busy ? "Tayyorlanmoqda…" : "Davom etish"}</button>
      </form>
      <p className="au-foot">Hisobingiz bormi? <Link to="/login">Kirish</Link></p>
    </AuthLayout>
  );
}
