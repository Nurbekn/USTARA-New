import DateInput from "../../components/DateInput";
import { formatDate } from "../../utils/format";
import Icon from "../../components/Icon";
import ArrowIcon from "../../components/ArrowIcon";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { clearSession } from "../auth/utils/session";
import L from "leaflet";
import LocationPicker from "../../components/LocationPicker";
import { isValidLocation } from "../../components/locationSearch";
import { Avatar } from "../../components/Avatar";
import ProfilePhotoSheet from "../../components/ProfilePhotoSheet";
import "./Profile.css";

const userMarker = L.divIcon({
  className: "up-marker-wrap",
  html: '<div class="up-marker">Siz shu yerdasiz</div>',
  iconSize: [130, 38],
  iconAnchor: [65, 38],
});

export default function Profile() {
  const { profile, setProfile } = useOutletContext();
  const navigate = useNavigate();
  const logoutDialog = useRef(null);
  const [logoutError, setLogoutError] = useState("");
  const [editor, setEditor] = useState(null);
  const isEditing = editor !== null;
  const editorHeading = useRef(null);
  useEffect(() => {
    if (editor) editorHeading.current?.focus();
  }, [editor]);
  const [draft, setDraft] = useState(profile);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  function confirmLogout() {
    try {
      clearSession();
    } catch {
      setLogoutError("Hisobdan chiqib bo‘lmadi. Qayta urinib ko‘ring.");
      return;
    }
    navigate("/login", { replace: true });
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
    setUploading(false);
    setDraft({ ...profile });
    setError("");
    setEditor(null);
  }

  function saveProfile(event) {
    event.preventDefault();
    if (uploading || editor === "phone") return;
    if (editor === "info" && (draft.firstName.trim().length < 2 || draft.lastName.trim().length < 2)) {
      setError("Ism va familiyangizni to‘liq kiriting (kamida 2 belgi).");
      return;
    }
    if (
      editor === "location" &&
      !isValidLocation(draft.location)
    ) {
      setError("Manzilni qidiruv natijasidan tanlang yoki xaritada belgilang.");
      return;
    }
    try {
      setProfile({
        ...draft,
        phone: profile.phone,
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        address: draft.address.trim(),
      });
    } catch {
      setError("Profil saqlanmadi. Brauzer xotirasini tekshirib, qayta urinib ko‘ring.");
      return;
    }
    setEditor(null);
    setError("");
    setMessage(editor === "location" ? "Joylashuvingiz saqlandi." : "Profil ma’lumotlari saqlandi.");
  }

  const shown = isEditing ? draft : profile;
  const fullName = [shown.firstName, shown.lastName].filter(Boolean).join(" ");
  const hasLocation = isValidLocation(profile.location);

  const titles = {
    info: "Shaxsiy ma’lumotlar",
    location: "Manzil",
    phone: "Telefon raqami",
  };

  const descriptions = {
    info: "Profilingizda ko‘rinadigan ma’lumotlarni yangilang.",
    phone: "Hisobingizga bog‘langan telefon raqami.",
    location: "Sizga yaqin ustalarni topish uchun joy tanlang.",
  };
  const editorIcons = {
    info: "person",
    phone: "phone",
    location: "pin",
  };

  return (
    <section className="up-profile" aria-label="Profil" key={editor || "overview"}>
      {isEditing ? (
        <>
          <button type="button" className="up-back" onClick={cancelEditing}>
            <ArrowIcon direction="left" /> Profilga qaytish
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
          <form
            className={`up-editor up-editor-${editor}`}
            onSubmit={saveProfile}
          >
            {editor === "info" && (
              <div className="up-fields">
                <label>
                  <span>Ism</span>
                  <input
                    placeholder="Ismingiz"
                    name="firstName"
                    autoComplete="given-name"
                    maxLength={80}
                    value={draft.firstName}
                    onChange={(e) =>
                      setDraft({ ...draft, firstName: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span>Familiya</span>
                  <input
                    placeholder="Familiyangiz"
                    name="lastName"
                    autoComplete="family-name"
                    maxLength={80}
                    value={draft.lastName}
                    onChange={(e) =>
                      setDraft({ ...draft, lastName: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span>
                    Tug‘ilgan sana <small>Ixtiyoriy</small>
                  </span>
                  <DateInput
                    name="birthDate"
                    autoComplete="bday"
                    value={draft.birthDate}
                    onChange={(birthDate) =>
                      setDraft({ ...draft, birthDate })
                    }
                  />
                </label>
              </div>
            )}
            {editor === "phone" && (
              <div className="up-phone-view">
                <div className="up-number-card">
                  <div className="up-number-label">
                    <span>Joriy raqam</span>
                    <span className="up-readonly">
                      <Icon size={21} name="lock" />
                      Faqat ko‘rish uchun
                    </span>
                  </div>
                  <p className="up-current-number">
                    {profile.phone || "Raqam kiritilmagan"}
                  </p>
                </div>
                <div className="up-phone-explanation">
                  <span className="up-explanation-icon">
                    <Icon size={21} name="lock" />
                  </span>
                  <div>
                    <h2>Raqamni almashtirish</h2>
                    <p>
                      Yangi telefon raqami SMS kodi bilan tasdiqlangandan so‘ng
                      hisobingizga bog‘lanadi.
                    </p>
                    <span className="up-availability">
                      Bu imkoniyat tez orada qo‘shiladi
                    </span>
                  </div>
                </div>
              </div>
            )}
            {editor === "location" && (
              <div className="up-location">
                <LocationPicker
                  showEmptySummary={false}
                  icon={userMarker}
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
                onClick={cancelEditing}
              >
                {editor === "phone" ? "Tushunarli" : "Bekor qilish"}
              </button>
              {editor !== "phone" && (
                <button
                  type="submit"
                  className="up-button up-primary"
                  disabled={uploading}
                >
                  Saqlash
                </button>
              )}
            </div>
          </form>
        </>
      ) : (
        <>
          <header className="up-identity">
            <button
              type="button"
              className="up-avatar-button"
              onClick={() => startEditing("photo")}
              aria-label="Profil rasmini o‘zgartirish"
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
              <h1>{fullName || "Foydalanuvchi"}</h1>
              {profile.phone && <p>{profile.phone}</p>}
              <button
                type="button"
                className="up-text-button"
                onClick={() => startEditing("info")}
              >
                Profilni tahrirlash <ArrowIcon />
              </button>
            </div>
          </header>
          <p className="up-feedback" role="status">
            {message}
          </p>
          <div className="up-menu" role="group" aria-label="Profil sozlamalari">
            <button
              type="button"
              className="up-menu-row"
              onClick={() => startEditing("info")}
            >
              <span className="up-menu-icon">
                <Icon size={21} name="person" />
              </span>
              <span className="up-menu-copy">
                <strong>Shaxsiy ma’lumotlar</strong>
                <span>
                  {profile.birthDate ? formatDate(profile.birthDate) : "Ism, familiya va tug‘ilgan sana"}
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
                <strong>Telefon raqami</strong>
                <span>{profile.phone || "Raqam kiritilmagan"}</span>
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
                <strong>{hasLocation ? "Manzilni o‘zgartirish" : "Manzil tanlash"}</strong>
                <span className={hasLocation ? "up-saved-address" : undefined}>
                  {profile.address ||
                    (hasLocation
                      ? "Xaritada belgilangan"
                      : "Yaqin ustalarni topish uchun")}
                </span>
              </span>
              <span className="up-chevron">
                <Icon size={21} name="chevronRight" />
              </span>
            </button>
          </div>
          {hasLocation && (
            <Link to="/user/explore?type=barbers&distance=5" className="up-nearby-link">
              <Icon size={21} name="pin" />
              <span>Yaqin ustalarni ko‘rish</span>
              <span className="up-chevron">
                <Icon size={21} name="chevronRight" />
              </span>
            </Link>
          )}
          <button
            type="button"
            className="up-logout"
            onClick={() => {
              setLogoutError("");
              logoutDialog.current.showModal();
            }}
          >
            <Icon size={21} name="logout" />
            Hisobdan chiqish
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
            <h2 id="up-logout-title">Hisobdan chiqasizmi?</h2>
            <p id="up-logout-description">
              Hisobingizdan chiqasiz. Profil ma’lumotlaringiz saqlanadi.
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
                Bekor qilish
              </button>
              <button
                type="button"
                className="up-button up-confirm-logout"
                onClick={confirmLogout}
              >
                Ha, chiqish
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
        onSave={(avatarPhoto) => setProfile({ ...profile, avatarPhoto, avatar: null })}
        onSaved={(avatarPhoto) => setMessage(avatarPhoto ? "Profil rasmi yangilandi." : "Profil rasmi olib tashlandi.")}
      />
    </section>
  );
}
