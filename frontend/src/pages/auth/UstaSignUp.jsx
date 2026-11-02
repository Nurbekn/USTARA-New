import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar, AvatarPicker } from "../barber/data/avatars";
import { AuthLayout, PhoneField, RoleSwitch } from "./components/AuthParts";
import "./auth-ui.css";

const SPECIALTIES = [
  { value: "barber", label: "Sartarosh" },
  { value: "beard", label: "Soqol ustasi" },
  { value: "stylist", label: "Stilist" },
  { value: "massage", label: "Massajchi" },
];

// Barber sign-up: avatar + name + phone + specialty -> OTP code.
// Services are NOT asked here: the barber adds them later in the panel.
export default function UstaSignup() {
  const navigate = useNavigate();
  const [avatar, setAvatar] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [specialty, setSpecialty] = useState("barber");
  const [errors, setErrors] = useState({});

  const clear = (field) => setErrors((previous) => ({ ...previous, [field]: "" }));

  const handleSubmit = (event) => {
    event.preventDefault();
    const digits = phone.replace(/\D/g, "");
    const next = {};

    if (name.trim().length < 3) next.name = "Ism va familiyangizni kiriting";
    if (digits.length !== 9) next.phone = "Telefon raqamni to'liq kiriting (9 ta raqam)";

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    //Malumotlarni yuborish otp ga
    navigate("/otp", {
      state: {
        phone: "+998" + digits,
        name: name.trim(),
        specialty,
        avatar,
        role: "barber",
      },
    });
  };

  return (
    <AuthLayout>
      <RoleSwitch role="barber" />

      <h1 className="au-title">Usta sifatida qo'shiling</h1>
      <p className="au-sub">Ishlaringizni ko'rsating va mijozlarni o'zingizga jalb qiling.</p>

      <form className="au-form" onSubmit={handleSubmit} noValidate>
        {/* Avatar */}
        <div className="au-field">
          <span className="au-label">Avatar</span>
          <div className="au-avatar-top">
            <Avatar id={avatar} size={84} name="Tanlangan avatar" className="au-avatar-big" />
            <small>Sizga yoqqanini tanlang</small>
          </div>
          <AvatarPicker value={avatar} onChange={setAvatar} size={46} className="au-avatars" />
        </div>

        <div className="au-field">
          <label className="au-label" htmlFor="name">
            Ism va familiya
          </label>
          <input
            id="name"
            className={`au-input ${errors.name ? "has-error" : ""}`}
            placeholder="Masalan: Nurbek Mirzayev"
            autoComplete="name"
            value={name}
            aria-invalid={!!errors.name}
            onChange={(event) => {
              setName(event.target.value);
              clear("name");
            }}
          />
          {errors.name && (
            <p className="au-error" role="alert">
              {errors.name}
            </p>
          )}
        </div>

        <PhoneField
          value={phone}
          error={errors.phone}
          onChange={(value) => {
            setPhone(value);
            clear("phone");
          }}
        />

        <div className="au-field" role="radiogroup" aria-label="Mutaxassislik">
          <span className="au-label">Mutaxassislik</span>
          <div className="au-chips">
            {SPECIALTIES.map((item) => (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={specialty === item.value}
                className={`au-chip ${specialty === item.value ? "is-active" : ""}`}
                onClick={() => setSpecialty(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <p className="au-info">
          Keyingi qadamda joylashuv va ish vaqtini kiritasiz. Xizmat va narxlarni
          keyinroq o'zingiz qo'shasiz.
        </p>

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
