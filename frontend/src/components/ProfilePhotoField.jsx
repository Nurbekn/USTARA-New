import Icon from "./Icon";
import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { prepareProfilePhoto } from "../utils/media/profilePhoto";
import "./ProfilePhotoField.css";

export default function ProfilePhotoField({ value = "", name = "", onChange, onBusyChange, compact = false }) {
  const inputId = useId();
  const inputRef = useRef(null);
  const versionRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => { versionRef.current += 1; }, []);

  async function choosePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const version = ++versionRef.current;
    setBusy(true);
    setError("");
    onBusyChange?.(true);
    try {
      const photo = await prepareProfilePhoto(file);
      if (version === versionRef.current) onChange(photo);
    } catch (cause) {
      if (version === versionRef.current) setError(cause.message || "Rasmni ochib bo‘lmadi. Qayta urinib ko‘ring.");
    } finally {
      if (version === versionRef.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  }

  return (
    <div className={`profile-photo-field${compact ? " is-compact" : ""}`} aria-busy={busy}>
      {!compact && <label className="profile-photo-label" htmlFor={inputId}>Profil rasmi <span>(ixtiyoriy)</span></label>}
      <input ref={inputRef} id={inputId} type="file" accept="image/*" hidden onChange={choosePhoto} disabled={busy} aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ""}`} />
      {compact ? (
        <button type="button" className="profile-photo-upload" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Icon name="cameraUpload" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" />
          {busy ? "Rasm tayyorlanmoqda…" : value ? "Rasmni almashtirish" : "Rasm qo‘shish"}
        </button>
      ) : (
      <button type="button" className="profile-photo-trigger" onClick={() => inputRef.current?.click()} disabled={busy} aria-label={value ? "Profil rasmini almashtirish" : "Profil rasmi qo‘shish"} aria-describedby={`${inputId}-hint`}>
        <Avatar photo={value} name={name} size={100} />
        <span className="profile-photo-add" aria-hidden="true">
          <Icon name="cameraUpload" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </span>
      </button>
      )}
      <p className="profile-photo-hint" id={`${inputId}-hint`} role="status">{busy ? "Rasm tayyorlanmoqda…" : compact ? "JPG, PNG yoki boshqa rasm · 25 MB gacha" : value ? "Rasmni almashtirish uchun ustiga bosing" : "Profil rasmi qo‘shish uchun doira ustiga bosing"}</p>
      {!compact && <p className="profile-photo-limit">JPG, PNG yoki boshqa rasm · 25 MB gacha</p>}
      {value && <button type="button" className="profile-photo-remove" disabled={busy} onClick={() => { setError(""); onChange(""); }}>Rasmni olib tashlash</button>}
      {error && <p className="profile-photo-error" id={`${inputId}-error`} role="alert">{error}</p>}
    </div>
  );
}
