import PhoneChangePanel from "../../components/phoneChange/PhoneChangePanel";
import DeviceSessionsPanel from "../../components/DeviceSessionsPanel";
import RevokeSessionsAction from "../../components/RevokeSessionsAction";
import DeactivateAccountAction from "../../components/DeactivateAccountAction";
import PrivacyExportV183 from "../../components/PrivacyExportV183";
import Icon from "../../components/Icon";
import ArrowIcon from "../../components/ArrowIcon";
import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { readSiteLocale, siteLocalePath } from "../../utils/siteLocale.js";
import { accountBarberUi } from "../../components/accountLocaleV145.js";
import LocationPicker from "../../components/LocationPicker";
import { isValidLocation } from "../../components/locationSearch";
import { clearSession } from "../auth/utils/session";
import PageHeader from "./components/PageHeader";
import PublicProfilePreviewCard from "./components/PublicProfilePreviewCard";
import TelegramLinkCard from "./components/TelegramLinkCard";
import Sheet from "../../components/Sheet";
import Stars from "./components/Stars";
import { useToast } from "./components/Toast";
import VerifiedAvatar from "../../components/VerifiedAvatar";
import ProfilePhotoSheet from "../../components/ProfilePhotoSheet";
import {
  STATUS,
  getRatingSummary,
  updateProfile,
  useBarber,
} from "./data/store";


const FIELDS = [
  "firstName",
  "lastName",
  "salonName",
  "telegram",
  "experience",
  "about",
  "certificates",
  "address",
  "location",
];

export default function Profile() {
  const { profile, bookings, reviews, posts, errors: loadErrors, status } = useBarber();
  const navigate = useNavigate();
  const location = useLocation();
  const lang = readSiteLocale(location.search);
  const copy = accountBarberUi(lang).barber;
  const { toast, show } = useToast();
  const certUi = {
    uz: { title: "Sertifikatlar", info: "O‘zingiz kiritgan ma’lumotlar. Admin tasdiqlagan badge hisoblanmaydi.", add: "Sertifikat qo‘shish", remove: "O‘chirish", name: "Sertifikat nomi", issuer: "Bergan tashkilot", year: "Yil" },
    ru: { title: "Сертификаты", info: "Указаны самостоятельно; не являются подтверждёнными платформой значками.", add: "Добавить сертификат", remove: "Удалить", name: "Название", issuer: "Выдавшая организация", year: "Год" },
    en: { title: "Certificates", info: "Self-reported, not platform-verified badges.", add: "Add certificate", remove: "Remove", name: "Certificate title", issuer: "Issuer", year: "Year" },
  }[lang] || null;

  const fallback = (key) => key === "certificates" ? [] : key === "location" ? null : "";
  const formFromProfile = (source) => Object.fromEntries(
    FIELDS.map((key) => [key, source[key] ?? fallback(key)]),
  );
  const [formState, setFormState] = useState(() => ({ profile, form: formFromProfile(profile) }));
  const form = formState.form;
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isDirty = (value, source) => FIELDS.some((key) =>
    JSON.stringify(value[key]) !== JSON.stringify(source[key] ?? fallback(key)),
  );
  const dirty = isDirty(form, formState.profile);
  if (status === "ready" && formState.profile !== profile) {
    setFormState({ profile, form: dirty ? form : formFromProfile(profile) });
  }
  const setForm = (update) => setFormState((previous) => ({
    ...previous,
    form: typeof update === "function" ? update(previous.form) : update,
  }));
  const set = (patch) => setForm((previous) => ({ ...previous, ...patch }));

  const completed = bookings.filter(
    (b) => b.status === STATUS.COMPLETED,
  ).length;
  const { average, count } = getRatingSummary(reviews);

  const save = async () => {
    if (form.firstName.trim().length < 2) return setError(copy.firstRequired);
    if (form.salonName.trim() && form.salonName.trim().length < 2)
      return setError(copy.salonRequired);
    setError("");
    setSaving(true);
    try {
      const saved = await updateProfile({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        salonName: form.salonName,
        address: form.address,
        location: form.location,
        experience: form.experience === "" ? null : Number(form.experience),
        about: form.about,
        certificates: form.certificates.map(c => ({ title: c.title.trim(), issuer: c.issuer.trim(), year: Number(c.year) })),
        avatarPhoto: profile.avatarPhoto,
      });
      setForm((previous) => ({ ...previous, ...saved }));
      setEditingLocation(false);
      const unsupportedChanged = ["telegram"]
        .some((key) => JSON.stringify(form[key]) !== JSON.stringify(profile[key] ?? (key === "location" ? null : "")));
      show(unsupportedChanged ? copy.savePartial : copy.saveOk);
    } catch (cause) {
      setError(cause.message || copy.saveFail);
    } finally { setSaving(false); }
  };

  return (
    <div className="bx-page bx-profile">
      <PageHeader title={copy.title} />

      <section className="bx-card bx-hero">
        <button
          type="button"
          className="bx-hero-avatar"
          onClick={() => {
            setPickingAvatar(true);
          }}
          aria-label={copy.picture}
        >
          <VerifiedAvatar verified={profile.verification_status === "approved"}
            photo={profile.avatarPhoto}
            id={profile.avatar}
            name={profile.firstName}
            size={92}
          />
          <span aria-hidden="true">
            <Icon
              name="cameraUpload"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </span>
        </button>
        <h2>
          {profile.firstName} {profile.lastName}
        </h2>
        <p className="bx-muted">{profile.salonName}</p>
        <div className="bx-hero-stats">
          <div>
            <strong>{completed}</strong>
            <span>{copy.completed}</span>
          </div>
          <div>
            <strong>{count ? average.toFixed(1) : "—"}</strong>
            <Stars value={average} size={11} />
          </div>
          <div>
            <strong>{profile.experience}</strong>
            <span>{copy.experience}</span>
          </div>
        </div>
      </section>

      <PublicProfilePreviewCard profile={profile} status={status} posts={posts} errors={loadErrors} dirty={dirty} />

      <nav className="bx-links" aria-label={copy.sections}>
        <Link to={siteLocalePath("/barber/shop", lang)}>{({uz:"Sartaroshxona profili va manzili",ru:"Профиль и адрес салона",en:"Shop profile and address"})[lang]}</Link>
        <Link to={siteLocalePath("/barber/earnings", lang)}>
          {copy.earnings}{" "}
          <span className="ui-arrow-inline">
            <ArrowIcon variant="chevron" />
          </span>
        </Link>
        <Link to={siteLocalePath("/barber/reviews", lang)}>
          {copy.reviews}{" "}
          <span className="ui-arrow-inline">
            <ArrowIcon variant="chevron" />
          </span>
        </Link>
        <Link to={siteLocalePath("/barber/services", lang)}>
          {copy.services}{" "}
          <span className="ui-arrow-inline">
            <ArrowIcon variant="chevron" />
          </span>
        </Link>
      </nav>

      <section className="bx-card bx-form">
        <h3>{copy.personal}</h3>
        <div className="bx-grid-2">
          <label className="bx-field">
            {copy.first}
            <input
              className="bx-input"
              maxLength={80}
              value={form.firstName}
              onChange={(e) => set({ firstName: e.target.value })}
            />
          </label>
          <label className="bx-field">
            {copy.last}
            <input
              className="bx-input"
              maxLength={80}
              value={form.lastName}
              onChange={(e) => set({ lastName: e.target.value })}
            />
          </label>
        </div>
        <label className="bx-field">
          {copy.salon}
          <input
            className="bx-input"
            value={form.salonName}
            onChange={(e) => set({ salonName: e.target.value })}
          />
        </label>
        <label className="bx-field">
          {copy.phone}
          <input className="bx-input" value={profile.phone} readOnly disabled />
        </label>
        <button type="button" className="bx-btn" onClick={() => setPhoneOpen(true)}>{copy.changePhone}</button>
        <div className="bx-grid-2">
          <label className="bx-field">
            {copy.telegram}
            <input
              className="bx-input"
              value={form.telegram}
              placeholder="username"
              onChange={(e) => set({ telegram: e.target.value })}
            />
          </label>
          <label className="bx-field">
            {copy.years}
            <input
              className="bx-input"
              inputMode="numeric"
              value={form.experience}
              onChange={(e) =>
                set({
                  experience: e.target.value.replace(/\D/g, "").slice(0, 2),
                })
              }
            />
          </label>
        </div>
        <label className="bx-field">
          {copy.about} ({form.about.length}/200)
          <textarea
            className="bx-input"
            rows={3}
            maxLength={200}
            value={form.about}
            onChange={(e) => set({ about: e.target.value })}
          />
        </label>
        <div className="bx-certificates-v171">
          <h3>{certUi.title}</h3>
          <p className="bx-muted">{certUi.info}</p>
          {form.certificates.map((certificate, index) => <div className="bx-card" key={index}>
            <label className="bx-field">{certUi.name}<input className="bx-input" maxLength={80} value={certificate.title} onChange={e => set({ certificates: form.certificates.map((c,i) => i === index ? { ...c, title: e.target.value } : c) })}/></label>
            <label className="bx-field">{certUi.issuer}<input className="bx-input" maxLength={80} value={certificate.issuer} onChange={e => set({ certificates: form.certificates.map((c,i) => i === index ? { ...c, issuer: e.target.value } : c) })}/></label>
            <label className="bx-field">{certUi.year}<input className="bx-input" type="number" min="1950" max={new Date().getFullYear()} value={certificate.year} onChange={e => set({ certificates: form.certificates.map((c,i) => i === index ? { ...c, year: e.target.value } : c) })}/></label>
            <button type="button" className="bx-btn bx-btn-ghost" onClick={() => set({ certificates: form.certificates.filter((_,i) => i !== index) })}>{certUi.remove}</button>
          </div>)}
          {form.certificates.length < 5 && <button type="button" className="bx-btn bx-btn-ghost" onClick={() => set({ certificates: [...form.certificates, { title: "", issuer: "", year: new Date().getFullYear() }] })}>{certUi.add}</button>}
        </div>
      </section>

      <TelegramLinkCard />

      <section className="bx-card bx-form bx-map">
        <div className="bx-location-head">
          <h3>{copy.address}</h3>
          <button
            type="button"
            className="bx-btn bx-btn-ghost bx-btn-sm bx-location-edit"
            aria-expanded={editingLocation}
            aria-controls="profile-location-map"
            onClick={() => {
              if (editingLocation && !isValidLocation(form.location))
                return setError(
                  copy.locationRequired,
                );
              setError("");
              setEditingLocation((previous) => !previous);
            }}
          >
            {editingLocation ? copy.done : copy.changeLocation}
          </button>
        </div>
        {!editingLocation && (
          <p className="bx-muted">
            {form.address ||
              (isValidLocation(form.location)
                ? copy.locationMarked
                : copy.locationMissing)}
          </p>
        )}
        <div id="profile-location-map" hidden={!editingLocation}>
          {editingLocation && (
            <LocationPicker
              showEmptySummary={false}
              value={form.location}
              address={form.address}
              onAddressChange={(address) => set({ address })}
              onChange={(location) => {
                set({ location });
                setError("");
              }}
            />
          )}
        </div>
      </section>

      {error && (
        <p className="bx-error" role="alert">
          {error}
        </p>
      )}

      <div className="bx-savebar">
        <button
          type="button"
          className="bx-btn bx-btn-primary bx-btn-block"
          disabled={!dirty || saving}
          onClick={save}
        >
          {saving ? copy.saving : dirty ? copy.save : copy.saved}
        </button>
      </div>

      <DeviceSessionsPanel className="bx-btn bx-btn-ghost bx-btn-block" />
      <RevokeSessionsAction className="bx-btn bx-btn-ghost bx-btn-block" />
      <DeactivateAccountAction className="bx-btn bx-btn-ghost bx-btn-block" />
      <PrivacyExportV183 className="bx-btn bx-btn-ghost bx-btn-block" />
      <button
        type="button"
        className="bx-btn bx-btn-danger bx-btn-block"
        onClick={() => setConfirmLogout(true)}
      >
        {copy.logout}
      </button>

      <Sheet
        open={confirmLogout}
        title={copy.logoutTitle}
        onClose={() => setConfirmLogout(false)}
      >
        <div className="bx-form">
          <p>{copy.logoutConfirm}</p>
          <button
            type="button"
            className="bx-btn bx-btn-ghost bx-btn-block"
            onClick={() => setConfirmLogout(false)}
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            className="bx-btn bx-btn-danger bx-btn-block"
            onClick={() => {
              clearSession();
              navigate("/login", { replace: true });
            }}
          >
            {copy.logoutYes}
          </button>
        </div>
      </Sheet>

      <Sheet open={phoneOpen} title={copy.phone} onClose={() => setPhoneOpen(false)}>
        {phoneOpen && <PhoneChangePanel currentPhone={profile.phone} startWithPassword/>}
      </Sheet>
      <ProfilePhotoSheet
        open={pickingAvatar}
        value={profile.avatarPhoto || ""}
        name={`${profile.firstName} ${profile.lastName}`}
        errorClassName="bx-error"
        onClose={() => setPickingAvatar(false)}
        onSave={async (avatarPhoto) => { await updateProfile({ avatarPhoto }); }}
        onSaved={() => show(copy.photoSaved)}
      />
      {toast}
    </div>
  );
}
