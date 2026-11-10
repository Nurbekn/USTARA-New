import ArrowIcon from "../../components/ArrowIcon";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import LocationPicker from "../../components/LocationPicker";
import { isValidLocation } from "../../components/locationSearch";
import { clearSession } from "../auth/utils/session";
import PageHeader from "./components/PageHeader";
import Sheet from "../../components/Sheet";
import Stars from "./components/Stars";
import { useToast } from "./components/Toast";
import { Avatar } from "../../components/Avatar";
import { STATUS, getRatingSummary, updateProfile, useBarber } from "./data/store";

import ProfilePhotoField from "../../components/ProfilePhotoField";

const FIELDS = ["firstName", "lastName", "salonName", "telegram", "experience", "about", "address", "location"];

export default function Profile() {
  const { profile, bookings, reviews } = useBarber();
  const navigate = useNavigate();
  const { toast, show } = useToast();

  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map((k) => [k, profile[k] ?? (k === "location" ? null : "")])));
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const photoBusyRef = useRef(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [error, setError] = useState("");

  const dirty = FIELDS.some((k) => JSON.stringify(form[k]) !== JSON.stringify(profile[k] ?? (k === "location" ? null : "")));
  const set = (patch) => setForm((previous) => ({ ...previous, ...patch }));

  const completed = bookings.filter((b) => b.status === STATUS.COMPLETED).length;
  const { average, count } = getRatingSummary(reviews);

  const save = () => {
    if (form.firstName.trim().length < 2) return setError("Ismni kiriting");
    if (form.salonName.trim() && form.salonName.trim().length < 2) return setError("Salon nomi kamida 2 belgi bo'lsin");
    if ((form.address !== (profile.address || "") || JSON.stringify(form.location) !== JSON.stringify(profile.location)) && !isValidLocation(form.location)) {
      return setError("Manzilni qidirib, topilgan natijani tanlang yoki xaritada joyni belgilang.");
    }
    setError("");
    const saved = updateProfile({
      ...form,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      salonName: form.salonName.trim(),
      telegram: form.telegram.replace("@", "").trim(),
      experience: form.experience === "" ? null : Math.max(0, Number(form.experience) || 0),
    });
    if (!saved) return setError("Profil saqlanmadi. Brauzer xotirasi to‘lgan yoki saqlash bloklangan. Qayta urinib ko‘ring.");
    setEditingLocation(false);
    show("Profil saqlandi");
  };

  return (
    <div className="bx-page bx-profile">
      <PageHeader title="Profil" />

      <section className="bx-card bx-hero">
        <button type="button" className="bx-hero-avatar" onClick={() => { setPhotoError(""); setPickingAvatar(true); }} aria-label="Profil rasmini o‘zgartirish">
          <Avatar photo={profile.avatarPhoto} id={profile.avatar} name={profile.firstName} size={92} />
          <span aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M4 7h4l2-3h4l2 3h4v13H4Z" /><circle cx="12" cy="13" r="3" /></svg></span>
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
        <Link to="/barber/earnings">Daromad <span className="ui-arrow-inline"><ArrowIcon variant="chevron" /></span></Link>
        <Link to="/barber/reviews">Sharhlar <span className="ui-arrow-inline"><ArrowIcon variant="chevron" /></span></Link>
        <Link to="/barber/services">Xizmatlar va narxlar <span className="ui-arrow-inline"><ArrowIcon variant="chevron" /></span></Link>
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
        <div className="bx-location-head">
          <h3>Manzil</h3>
          <button type="button" className="bx-btn bx-btn-ghost bx-btn-sm bx-location-edit" aria-expanded={editingLocation} aria-controls="profile-location-map" onClick={() => {
            if (editingLocation && !isValidLocation(form.location)) return setError("Avval topilgan manzilni tanlang yoki xaritada joyni belgilang.");
            setError("");
            setEditingLocation((previous) => !previous);
          }}>
            {editingLocation ? "Tayyor" : "Joylashuvni o‘zgartirish"}
          </button>
        </div>
        {!editingLocation && <p className="bx-muted">{form.address || (isValidLocation(form.location) ? "Joylashuv xaritada belgilangan." : "Manzil hali belgilanmagan.")}</p>}
        <div id="profile-location-map" hidden={!editingLocation}>
          {editingLocation && <LocationPicker
            showEmptySummary={false}
            value={form.location}
            address={form.address}
            onAddressChange={(address) => set({ address })}
            onChange={(location) => { set({ location }); setError(""); }}
          />}
        </div>
      </section>

      {error && <p className="bx-error" role="alert">{error}</p>}

      <div className="bx-savebar">
        <button type="button" className="bx-btn bx-btn-primary bx-btn-block" disabled={!dirty} onClick={save}>
          {dirty ? "Saqlash" : "Saqlangan"}
        </button>
      </div>

      <button type="button" className="bx-btn bx-btn-danger bx-btn-block" onClick={() => setConfirmLogout(true)}>
        Chiqish
      </button>

      <Sheet open={confirmLogout} title="Hisobdan chiqish" onClose={() => setConfirmLogout(false)}>
        <div className="bx-form">
          <p>Hisobingizdan aniq chiqmoqchimisiz?</p>
          <button type="button" className="bx-btn bx-btn-ghost bx-btn-block" onClick={() => setConfirmLogout(false)}>
            Bekor qilish
          </button>
          <button type="button" className="bx-btn bx-btn-danger bx-btn-block" onClick={() => {
            clearSession();
            navigate("/login", { replace: true });
          }}>
            Ha, chiqish
          </button>
        </div>
      </Sheet>

      <Sheet compact open={pickingAvatar} title="Profil rasmi" onClose={() => { if (!photoBusyRef.current) setPickingAvatar(false); }}>
        <div className="bx-form" aria-busy={photoBusy}>
          <ProfilePhotoField
            compact
            value={profile.avatarPhoto || ""}
            name={`${profile.firstName} ${profile.lastName}`}
            onBusyChange={(busy) => { photoBusyRef.current = busy; setPhotoBusy(busy); }}
            onChange={(avatarPhoto) => {
              setPhotoError("");
              if (!updateProfile({ avatarPhoto, avatar: null })) {
                setPhotoError("Rasm saqlanmadi. Brauzer xotirasini tekshirib, qayta urinib ko‘ring.");
                return;
              }
              photoBusyRef.current = false;
              setPhotoBusy(false);
              setPickingAvatar(false);
              show(avatarPhoto ? "Profil rasmi yangilandi" : "Profil rasmi olib tashlandi");
            }}
          />
          {photoError && <p className="bx-error" role="alert">{photoError}</p>}
        </div>
      </Sheet>
      {toast}
    </div>
  );
}
