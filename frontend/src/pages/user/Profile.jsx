import PhoneChangePanel from "../../components/phoneChange/PhoneChangePanel";
import DeviceSessionsPanel from "../../components/DeviceSessionsPanel";
import RevokeSessionsAction from "../../components/RevokeSessionsAction";
import DeactivateAccountAction from "../../components/DeactivateAccountAction";
import PrivacyExportV183 from "../../components/PrivacyExportV183";
import CustomerTelegramV190 from "../../components/CustomerTelegramV190";
import DateInput from "../../components/DateInput";
import { formatDate } from "../../utils/format";
import Icon from "../../components/Icon";
import ArrowIcon from "../../components/ArrowIcon";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { readSiteLocale, siteLocalePath } from "../../utils/siteLocale.js";
import { v144InnerUi } from "../auth/innerLocaleV144.js";
import { clearSession } from "../auth/utils/session";
import L from "leaflet";
import LocationPicker from "../../components/LocationPicker";
import { isValidLocation } from "../../components/locationSearch";
import { Avatar } from "../../components/Avatar";
import ProfilePhotoSheet from "../../components/ProfilePhotoSheet";
import "./Profile.css";
import PageLoading from "../../components/Loading";
import { loadCustomerProfile, saveCustomerProfileToServer } from "./data/profile";

const userMarker = (label) => L.divIcon({
  className: "up-marker-wrap",
  html: `<div class="up-marker">${label}</div>`,
  iconSize: [130, 38],
  iconAnchor: [65, 38],
});

export default function Profile() {
  const location = useLocation();
  const lang = readSiteLocale(location.search);
  const ui = v144InnerUi(lang).customer;
  const marker = useMemo(() => userMarker(ui.mapHere), [lang]);
  const [profile, setProfile] = useState(null);
  const [loadState, setLoadState] = useState({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const saveController = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.resolve().then(() => loadCustomerProfile({ signal: controller.signal }))
      .then((data) => { if (active) { setProfile(data); setLoadState({ status: "ready" }); } })
      .catch((error) => { if (active) setLoadState({ status: "error", message: error.message }); });
    return () => { active = false; controller.abort(); };
  }, [attempt]);
  useEffect(() => () => saveController.current?.abort(), []);
  const navigate = useNavigate();
  const logoutDialog = useRef(null);
  const [logoutError, setLogoutError] = useState("");
  const [editor, setEditor] = useState(null);
  const isEditing = editor !== null;
  const editorHeading = useRef(null);
  useEffect(() => {
    if (editor) editorHeading.current?.focus();
  }, [editor]);
  const [draft, setDraft] = useState({ firstName: "", lastName: "", birthDate: "", address: "", location: null });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  function confirmLogout() {
    try {
      clearSession();
    } catch {
      setLogoutError(ui.logoutError);
      return;
    }
    navigate(siteLocalePath("/login", lang), { replace: true });
  }

  function startEditing(section = "info") {
    if (section === "photo") {
      setMessage("");
      setPhotoOpen(true);
      return;
    }
    setDraft({ ...profile });
    setError("");
    setMessage("");
    setEditor(section);
  }

  function cancelEditing() {
    if (saveController.current) return;
    setUploading(false);
    setDraft({ ...profile });
    setError("");
    setEditor(null);
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (uploading || saveController.current || editor === "phone") return;
    if (editor === "info" && (draft.firstName.trim().length < 2 || draft.lastName.trim().length < 2)) {
      setError(ui.nameError);
      return;
    }
    if (
      editor === "location" &&
      !isValidLocation(draft.location)
    ) {
      setError(ui.locationError);
      return;
    }
    if (!['info', 'location'].includes(editor)) {
      setError(ui.unsupported);
      return;
    }
    const controller = new AbortController();
    saveController.current = controller;
    setSaving(true); setError(""); setMessage("");
    try {
      const updated = await saveCustomerProfileToServer({
        ...profile,
        ...(editor === "info" ? { firstName: draft.firstName.trim(), lastName: draft.lastName.trim() } : {}),
        ...(editor === "location" ? { address: draft.address, location: draft.location } : {}),
      }, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setProfile(updated); setEditor(null); setError(""); setMessage(ui.saved);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error.profileSaved) {
          setEditor(null);
          setLoadState({ status: "error", message: ui.savedReload });
        } else setError(error.message || ui.saveError);
      }
    } finally {
      if (!controller.signal.aborted) setSaving(false);
      if (saveController.current === controller) saveController.current = null;
    }
  }

  if (loadState.status === "loading") return <PageLoading label={ui.loading} />;
  if (loadState.status === "error") return <section className="up-profile" role="alert">
    <h1>{ui.loadError}</h1><p className="up-error">{loadState.message}</p>
    <button type="button" className="up-button up-primary" onClick={() => {
      setLoadState({ status: "loading" }); setAttempt((value) => value + 1);
    }}>{ui.retry}</button>
  </section>;

  const shown = isEditing ? draft : profile;
  const fullName = [shown.firstName, shown.lastName].filter(Boolean).join(" ");
  const hasLocation = isValidLocation(profile.location);

  const titles = {
    info: ui.info,
    location: ui.location,
    phone: ui.phone,
  };

  const descriptions = {
    info: ui.infoHint,
    phone: ui.phoneHint,
    location: ui.locationHint,
  };
  const editorIcons = {
    info: "person",
    phone: "phone",
    location: "pin",
  };

  return (
    <section className="up-profile" aria-label={ui.profile} key={editor || "overview"}>
      {isEditing ? (
        <>
          <button type="button" className="up-back" disabled={saving} onClick={cancelEditing}>
            <ArrowIcon direction="left" /> {ui.back}
          </button>
          <div className="up-editor-heading">
            <span className="up-editor-symbol">
              <Icon size={21} name={editorIcons[editor]} />
            </span>
            <h1 className="up-editor-title" tabIndex={-1} ref={editorHeading}>
              {titles[editor]}
            </h1>
            <p>{descriptions[editor]}</p>
          </div>
          {editor === "phone" ? <PhoneChangePanel currentPhone={profile.phone}/> : <form
            className={`up-editor up-editor-${editor}`}
            onSubmit={saveProfile}
          >
            {editor === "info" && (
              <div className="up-fields">
                <label>
                  <span>{ui.first}</span>
                  <input
                    placeholder={ui.firstPlaceholder}
                    name="firstName"
                    autoComplete="given-name"
                    maxLength={80}
                    disabled={saving}
                    value={draft.firstName}
                    onChange={(e) =>
                      setDraft({ ...draft, firstName: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span>{ui.last}</span>
                  <input
                    placeholder={ui.lastPlaceholder}
                    name="lastName"
                    autoComplete="family-name"
                    maxLength={80}
                    disabled={saving}
                    value={draft.lastName}
                    onChange={(e) =>
                      setDraft({ ...draft, lastName: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span>
                    {ui.birthday} <small>{ui.optional}</small>
                  </span>
                  <DateInput
                    name="birthDate"
                    autoComplete="bday"
                    value={draft.birthDate}
                    disabled
                    onChange={(birthDate) =>
                      setDraft({ ...draft, birthDate })
                    }
                  />
                  <small>{ui.birthdayUnavailable}</small>
                </label>
              </div>
            )}
            {editor === "location" && (
              <div className="up-location">
                <LocationPicker
                  showEmptySummary={false}
                  icon={marker}
                  value={draft.location}
                  address={draft.address}
                  onChange={(location) =>
                    setDraft((previous) => ({ ...previous, location }))
                  }
                  onAddressChange={(address) =>
                    setDraft((previous) => ({ ...previous, address }))
                  }
                />
              </div>
            )}
            {error && (
              <p role="alert" className="up-error">
                {error}
              </p>
            )}
            <div className="up-edit-actions">
              <button
                type="button"
                className="up-button"
                disabled={saving}
                onClick={cancelEditing}
              >
                {ui.cancel}
              </button>
              {editor !== "phone" && (
                <button
                  type="submit"
                  className="up-button up-primary"
                  disabled={uploading || saving || !["info", "location"].includes(editor)}
                >
                  {saving ? ui.saving : ui.save}
                </button>
              )}
            </div>
          </form>}
        </>
      ) : (
        <>
          <header className="up-identity">
            <button
              type="button"
              className="up-avatar-button"
              title={ui.editPhoto}
              onClick={() => startEditing("photo")}
              aria-label={ui.editPhoto}
            >
              <Avatar className="up-user-avatar"
                photo={profile.avatarPhoto}
                id={profile.avatar}
                name={fullName}
                size={96}
              />
              <span className="up-avatar-edit">
                <Icon size={21} name="camera" />
              </span>
            </button>
            <div className="up-identity-text">
              <h1>{fullName || ui.user}</h1>
              {profile.phone && <p>{profile.phone}</p>}
              <button
                type="button"
                className="up-text-button"
                onClick={() => startEditing("info")}
              >
                {ui.edit} <ArrowIcon />
              </button>
            </div>
          </header>
          <p className="up-feedback" role="status">
            {message}
          </p>
          <div className="up-menu" role="group" aria-label={ui.settings}>
            <Link className="up-menu-row" to={siteLocalePath("/user/chat",lang)}><span className="up-menu-icon"><Icon size={21} name="send" /></span><span className="up-menu-copy"><strong>{({uz:"Xabarlar",ru:"Сообщения",en:"Messages"})[lang]}</strong></span><span className="up-chevron"><Icon size={21} name="chevronRight" /></span></Link>
            <button
              type="button"
              className="up-menu-row"
              onClick={() => startEditing("info")}
            >
              <span className="up-menu-icon">
                <Icon size={21} name="person" />
              </span>
              <span className="up-menu-copy">
                <strong>{ui.info}</strong>
                <span>
                  {profile.birthDate ? formatDate(profile.birthDate) : ui.infoDescription}
                </span>
              </span>
              <span className="up-chevron">
                <Icon size={21} name="chevronRight" />
              </span>
            </button>
            <button
              type="button"
              className="up-menu-row"
              onClick={() => startEditing("phone")}
            >
              <span className="up-menu-icon">
                <Icon size={21} name="phone" />
              </span>
              <span className="up-menu-copy">
                <strong>{ui.phone}</strong>
                <span>{profile.phone || ui.phoneMissing}</span>
              </span>
              <span className="up-chevron">
                <Icon size={21} name="chevronRight" />
              </span>
            </button>
            <button
              type="button"
              className="up-menu-row up-menu-row--location"
              onClick={() => startEditing("location")}
            >
              <span className="up-menu-icon">
                <Icon size={21} name="pin" />
              </span>
              <span className="up-menu-copy">
                <strong>{hasLocation ? ui.changeLocation : ui.selectLocation}</strong>
                <span className={hasLocation ? "up-saved-address" : undefined}>
                  {profile.address ||
                    (hasLocation
                      ? ui.mapSelected
                      : ui.nearbyHint)}
                </span>
              </span>
              <span className="up-chevron">
                <Icon size={21} name="chevronRight" />
              </span>
            </button>
          </div>
          {hasLocation && (
            <Link to={siteLocalePath("/user/explore?type=barbers&distance=5", lang)} className="up-nearby-link">
              <Icon size={21} name="pin" />
              <span>{ui.nearby}</span>
              <span className="up-chevron">
                <Icon size={21} name="chevronRight" />
              </span>
            </Link>
          )}
          <DeviceSessionsPanel className="up-logout" />
          <RevokeSessionsAction className="up-logout" />
          <DeactivateAccountAction className="up-logout" />
          <PrivacyExportV183 className="up-logout" />
          <CustomerTelegramV190 className="up-logout" />
          <button
            type="button"
            className="up-logout"
            onClick={() => {
              setLogoutError("");
              logoutDialog.current.showModal();
            }}
          >
            <Icon size={21} name="logout" />
            {ui.logout}
          </button>
          <dialog
            ref={logoutDialog}
            className="up-logout-dialog"
            aria-labelledby="up-logout-title"
            aria-describedby="up-logout-description"
          >
            <span className="up-logout-symbol">
              <Icon size={21} name="logout" />
            </span>
            <h2 id="up-logout-title">{ui.logoutTitle}</h2>
            <p id="up-logout-description">
              {ui.logoutDescription}
            </p>
            {logoutError && (
              <p className="up-error" role="alert">
                {logoutError}
              </p>
            )}
            <div className="up-logout-actions">
              <button
                type="button"
                className="up-button"
                autoFocus
                onClick={() => logoutDialog.current.close()}
              >
                {ui.cancel}
              </button>
              <button
                type="button"
                className="up-button up-confirm-logout"
                onClick={confirmLogout}
              >
                {ui.confirmLogout}
              </button>
            </div>
          </dialog>
        </>
      )}
      <ProfilePhotoSheet
        open={photoOpen}
        value={profile.avatarPhoto || ""}
        name={[profile.firstName, profile.lastName].filter(Boolean).join(" ")}
        errorClassName="up-error"
        onClose={() => setPhotoOpen(false)}
        onBusyChange={setUploading}
        onSave={async (avatarPhoto) => {
          const updated = await saveCustomerProfileToServer({ ...profile, avatarPhoto });
          setProfile(updated);
          return updated;
        }}
        onSaved={(avatarPhoto) => setMessage(avatarPhoto ? ui.photoSaved : ui.photoRemoved)}
      />
    </section>
  );
}
