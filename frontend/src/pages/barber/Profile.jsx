import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import LocationPicker from "../../components/LocationPicker";
import { clearSession } from "../auth/utils/session";
import PageHeader from "./components/PageHeader";
import Sheet from "./components/Sheet";
import Stars from "./components/Stars";
import { useToast } from "./components/Toast";
import { Avatar, AvatarPicker } from "./data/avatars";
import { STATUS, getRatingSummary, updateProfile, useBarber } from "./data/store";

import { prepareProfilePhoto } from "./data/profilePhoto";

const FIELDS = ["firstName", "lastName", "username", "salonName", "telegram", "experience", "about", "address", "location"];

export default function Profile() {
  const { profile, bookings, reviews } = useBarber();
  const navigate = useNavigate();
  const { toast, show } = useToast();

  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map((k) => [k, profile[k] ?? (k === "location" ? null : "")])));
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const photoInput = useRef(null);
  const photoBusyRef = useRef(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [error, setError] = useState("");

  const dirty = FIELDS.some((k) => JSON.stringify(form[k]) !== JSON.stringify(profile[k] ?? (k === "location" ? null : "")));
  const set = (patch) => setForm({ ...form, ...patch });

  const completed = bookings.filter((b) => b.status === STATUS.COMPLETED).length;
  const { average, count } = getRatingSummary(reviews);

  const changePhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || photoBusyRef.current) return;
    photoBusyRef.current = true;
    setPhotoBusy(true);
    setPhotoError("");
    try {
      const avatarPhoto = await prepareProfilePhoto(file);
      if (!updateProfile({ avatarPhoto })) {
        setPhotoError("Rasm saqlanmadi. Brauzer xotirasi to'lgan yoki saqlash bloklangan. Joy bo'shatib qayta urinib ko'ring.");
        return;
      }
      setPickingAvatar(false);
      show("Profil rasmi yangilandi");
    } catch (error) {
      setPhotoError(error.message);
    } finally {
      photoBusyRef.current = false;
      setPhotoBusy(false);
    }
  };

  const save = () => {
    if (form.firstName.trim().length < 2) return setError("Ismni kiriting");
    if (form.salonName.trim() && form.salonName.trim().length < 2) return setError("Salon nomi kamida 2 belgi bo'lsin");
    const username = form.username.trim().replace(/^@+/, "");
    if (username && !/^[a-zA-Z0-9_.]{3,30}$/.test(username)) return setError("Username 3–30 ta harf, raqam, nuqta yoki pastki chiziqdan iborat bo'lsin.");
    setError("");
    const saved = updateProfile({
      ...form,
      username,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      salonName: form.salonName.trim(),
      telegram: form.telegram.replace("@", "").trim(),
      experience: form.experience === "" ? null : Math.max(0, Number(form.experience) || 0),
    });
    if (!saved) return setError("Profil saqlanmadi. Brauzer xotirasi to‘lgan yoki saqlash bloklangan. Qayta urinib ko‘ring.");
    show("Profil saqlandi");
  };

  return (
    <div className="bx-page">
      <PageHeader title="Profil" />

      <section className="bx-card bx-hero">
        <button type="button" className="bx-hero-avatar" onClick={() => { setPhotoError(""); setPickingAvatar(true); }} aria-label="Avatarni o'zgartirish">
          <Avatar photo={profile.avatarPhoto} id={profile.avatar} name={profile.firstName} size={92} />
          <span>✎</span>
        </button>
        <h2>
          {profile.firstName} {profile.lastName}
        </h2>
        <p className="bx-muted">{profile.salonName}</p>
        <div className="bx-hero-stats">
          <div>
            <strong>{completed}</strong>
            <span>Xizmat</span>
          </div>
          <div>
            <strong>{count ? average.toFixed(1) : "—"}</strong>
            <Stars value={average} size={11} />
          </div>
          <div>
            <strong>{profile.experience}</strong>
            <span>Yil tajriba</span>
          </div>
        </div>
      </section>

      <nav className="bx-links" aria-label="Bo'limlar">
        <Link to="/barber/earnings">Daromad <span>›</span></Link>
        <Link to="/barber/reviews">Sharhlar <span>›</span></Link>
        <Link to="/barber/services">Xizmatlar va narxlar <span>›</span></Link>
      </nav>

      <section className="bx-card bx-form">
        <h3>Shaxsiy ma'lumotlar</h3>
        <div className="bx-grid-2">
          <label className="bx-field">
            Ism
            <input className="bx-input" value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} />
          </label>
          <label className="bx-field">
            Familiya
            <input className="bx-input" value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} />
          </label>
        </div>
        <label className="bx-field">
          Username
          <input className="bx-input" value={form.username} maxLength={31} autoCapitalize="none" spellCheck={false} onChange={(e) => set({ username: e.target.value })} />
          <span className="bx-muted">Ixtiyoriy · 3–30 belgi. Hozircha faqat profilingizda ko'rsatiladi.</span>
        </label>
        <label className="bx-field">
          Salon nomi
          <input className="bx-input" value={form.salonName} onChange={(e) => set({ salonName: e.target.value })} />
        </label>
        <label className="bx-field">
          Telefon
          <input className="bx-input" value={profile.phone} readOnly disabled />
        </label>
        <div className="bx-grid-2">
          <label className="bx-field">
            Telegram
            <input className="bx-input" value={form.telegram} placeholder="username" onChange={(e) => set({ telegram: e.target.value })} />
          </label>
          <label className="bx-field">
            Tajriba (yil)
            <input className="bx-input" inputMode="numeric" value={form.experience}
              onChange={(e) => set({ experience: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
          </label>
        </div>
        <label className="bx-field">
          O'zingiz haqingizda ({form.about.length}/200)
          <textarea className="bx-input" rows={3} maxLength={200} value={form.about} onChange={(e) => set({ about: e.target.value })} />
        </label>
      </section>

      <section className="bx-card bx-form bx-map">
        <h3>Manzil</h3>
        <label className="bx-field">
          Manzil (matn)
          <input className="bx-input" value={form.address} onChange={(e) => set({ address: e.target.value })} />
        </label>
        <LocationPicker
          value={form.location}
          onChange={(location) => set({ location })}
        />
      </section>

      {error && <p className="bx-error" role="alert">{error}</p>}

      <div className="bx-savebar">
        <button type="button" className="bx-btn bx-btn-primary bx-btn-block" disabled={!dirty} onClick={save}>
          {dirty ? "Saqlash" : "Saqlangan"}
        </button>
      </div>

      <button type="button" className="bx-btn bx-btn-ghost bx-btn-block" onClick={() => {
          clearSession();
          navigate("/login");
        }}>
        Chiqish
      </button>

      <Sheet open={pickingAvatar} title="Profil rasmi" onClose={() => { if (!photoBusyRef.current) setPickingAvatar(false); }}>
        <div className="bx-form" aria-busy={photoBusy}>
          <input ref={photoInput} type="file" accept="image/*" className="bx-file-input" tabIndex={-1} onChange={changePhoto} />
          <button type="button" className="bx-btn bx-btn-primary bx-btn-block" disabled={photoBusy} onClick={() => photoInput.current.click()}>
            {photoBusy ? "Rasm tayyorlanmoqda..." : "O'z rasmimni yuklash"}
          </button>
          <p className="bx-muted">Rasm · 25 MB gacha. Rasm markazdan kvadrat kesilib, kichraytirib saqlanadi.</p>
          {photoBusy && <p role="status" className="bx-muted">Rasm yuklanmoqda...</p>}
          {photoError && <p className="bx-error" role="alert">{photoError}</p>}
          <h3>Yoki tayyor avatar tanlang</h3>
        <AvatarPicker
          value={profile.avatarPhoto ? null : profile.avatar}
          onChange={(id) => {
            if (photoBusyRef.current) return;
            if (!updateProfile({ avatar: id, avatarPhoto: "" })) {
              setPhotoError("Avatar saqlanmadi. Brauzer xotirasini tekshirib qayta urinib ko'ring.");
              return;
            }
            setPickingAvatar(false);
            show("Avatar o'zgartirildi");
          }}
        />
        </div>
      </Sheet>
      {toast}
    </div>
  );
}
