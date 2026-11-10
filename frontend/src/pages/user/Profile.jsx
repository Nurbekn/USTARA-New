import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { clearSession } from "../auth/utils/session";
import L from "leaflet";
import LocationPicker from "../../components/LocationPicker";
import { isValidLocation } from "../../components/locationSearch";
import Avatar from "./components/UserAvatar";
import { prepareProfilePhoto } from "../../utils/media/profilePhoto";
import "./Profile.css";

const userMarker = L.divIcon({
  className: "up-marker-wrap",
  html: '<div class="up-marker">Siz shu yerdasiz</div>',
  iconSize: [130, 38],
  iconAnchor: [65, 38],
});
const avatarOptions = [1, 2, 3, 4, 5, 6, 7, 8];

function ProfileIcon({ name }) {
  const paths = {
    person: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
      </>
    ),
    phone: (
      <>
        <rect x="6" y="2" width="12" height="20" rx="3" />
        <path d="M10 18h4" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    arrow: <path d="m9 5 7 7-7 7" />,
    logout: (
      <>
        <path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        <path d="M12 14v3" />
      </>
    ),
    camera: (
      <>
        <path d="M8 5 10 2h4l2 3h4v14H4V5Z" />
        <circle cx="12" cy="11" r="3" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="21"
      height="21"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

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
  const uploadVersion = useRef(0);
  useEffect(
    () => () => {
      uploadVersion.current += 1;
    },
    [],
  );

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
    setDraft({ ...profile });
    setError("");
    setMessage("");
    setEditor(section);
  }

  function cancelEditing() {
    uploadVersion.current += 1;
    setUploading(false);
    setDraft({ ...profile });
    setError("");
    setEditor(null);
  }

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const version = ++uploadVersion.current;
    setUploading(true);
    setError("");
    try {
      const avatarPhoto = await prepareProfilePhoto(file);
      if (version === uploadVersion.current) {
        setDraft((previous) => ({ ...previous, avatarPhoto }));
      }
    } catch (cause) {
      if (version === uploadVersion.current) setError(cause.message);
    } finally {
      if (version === uploadVersion.current) setUploading(false);
    }
  }

  function saveProfile(event) {
    event.preventDefault();
    if (uploading || editor === "phone") return;
    if (
      editor === "location" &&
      draft.address.trim() &&
      !isValidLocation(draft.location)
    ) {
      setError("Manzilni qidiruv natijasidan tanlang yoki xaritada belgilang.");
      return;
    }
    setProfile({
      ...draft,
      phone: profile.phone,
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      address: draft.address.trim(),
    });
    setEditor(null);
    setError("");
    setMessage("Profil ma’lumotlari saqlandi.");
  }

  const shown = isEditing ? draft : profile;
  const fullName = [shown.firstName, shown.lastName].filter(Boolean).join(" ");
  const hasLocation = isValidLocation(profile.location);

  const completion = [
    { done: !!profile.firstName.trim(), section: "info" },
    { done: !!profile.lastName.trim(), section: "info" },
    { done: !!profile.birthDate, section: "info" },
    { done: !!(profile.avatar || profile.avatarPhoto), section: "photo" },
    { done: hasLocation, section: "location" },
  ];
  const completed = completion.filter((item) => item.done).length;
  const completionPercent = completed * 20;
  const nextSection = completion.find((item) => !item.done)?.section;
  const personalCount = completion
    .slice(0, 3)
    .filter((item) => item.done).length;

  const titles = {
    info: "Shaxsiy ma’lumotlar",
    photo: "Profil rasmi",
    location: "Manzil",
    phone: "Telefon raqami",
  };

  const descriptions = {
    info: "Profilingizda ko‘rinadigan ma’lumotlarni yangilang.",
    phone: "Hisobingizga bog‘langan telefon raqami.",
    location: "Sizga yaqin barberlarni topish uchun joy tanlang.",
    photo: "Rasm yuklang yoki tayyor avatar tanlang.",
  };
  const editorIcons = {
    info: "person",
    phone: "phone",
    location: "pin",
    photo: "camera",
  };

  return (
    <section className="up-profile" key={editor || "overview"}>
      {isEditing ? (
        <>
          <button type="button" className="up-back" onClick={cancelEditing}>
            ← Profilga qaytish
          </button>
          <div className="up-editor-heading">
            <span className="up-editor-symbol">
              <ProfileIcon name={editorIcons[editor]} />
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
                  <input
                    name="birthDate"
                    type="date"
                    autoComplete="bday"
                    value={draft.birthDate}
                    onChange={(e) =>
                      setDraft({ ...draft, birthDate: e.target.value })
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
                      <ProfileIcon name="lock" />
                      Faqat ko‘rish uchun
                    </span>
                  </div>
                  <p className="up-current-number">
                    {profile.phone || "Raqam kiritilmagan"}
                  </p>
                </div>
                <div className="up-phone-explanation">
                  <span className="up-explanation-icon">
                    <ProfileIcon name="lock" />
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
            {editor === "photo" && (
              <div className="up-photo-editor">
                <div className="up-photo-preview">
                  <Avatar
                    photo={draft.avatarPhoto}
                    id={draft.avatar}
                    name={fullName}
                    size={96}
                  />
                </div>
                <label className="up-button up-upload">
                  {uploading ? "Rasm tayyorlanmoqda…" : "Rasm yuklash"}
                  <input
                    type="file"
                    accept="image/*"
                    aria-label="Profil rasmini yuklash"
                    onChange={uploadPhoto}
                    disabled={uploading}
                  />
                </label>
                <p className="up-hint">Rasm hajmi 25 MB gacha</p>
                <div className="up-avatar-divider">Yoki avatar tanlang</div>
                <div
                  className="up-avatar-options"
                  aria-label="Tayyor avatarlar"
                >
                  {avatarOptions.map((id, index) => (
                    <button
                      type="button"
                      key={id}
                      aria-label={`${index + 1}-avatar`}
                      aria-pressed={!draft.avatarPhoto && draft.avatar === id}
                      onClick={() => {
                        uploadVersion.current += 1;
                        setUploading(false);
                        setError("");
                        setDraft((previous) => ({
                          ...previous,
                          avatar: id,
                          avatarPhoto: "",
                        }));
                      }}
                    >
                      <Avatar id={id} size={56} />
                    </button>
                  ))}
                </div>
                {draft.avatarPhoto && (
                  <button
                    className="up-text-button"
                    type="button"
                    onClick={() =>
                      setDraft((previous) => ({ ...previous, avatarPhoto: "" }))
                    }
                  >
                    Rasmni olib tashlash
                  </button>
                )}
              </div>
            )}
            {editor === "location" && (
              <div className="up-location">
                <LocationPicker
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
          <div className="up-overview-heading">
            <h1 className="up-page-title">Mening profilim</h1>
            <p>Shaxsiy ma’lumotlar va sozlamalar</p>
          </div>
          <header className="up-identity">
            <button
              type="button"
              className="up-avatar-button"
              onClick={() => startEditing("photo")}
              aria-label="Profil rasmini o‘zgartirish"
            >
              <Avatar
                photo={profile.avatarPhoto}
                id={profile.avatar}
                name={fullName}
                size={104}
              />
              <span className="up-avatar-edit">
                <ProfileIcon name="camera" />
              </span>
            </button>
            <div className="up-identity-text">
              <h2>{fullName || "Foydalanuvchi"}</h2>
              {profile.phone && <p>{profile.phone}</p>}
              <button
                type="button"
                className="up-text-button"
                onClick={() => startEditing("photo")}
              >
                Rasmni o‘zgartirish
              </button>
            </div>
          </header>
          <p className="up-feedback" role="status">
            {message}
          </p>
          <div className="up-completion">
            <div className="up-completion-heading">
              <span>
                {completed === completion.length
                  ? "Profilingiz to‘ldirilgan"
                  : "Profilni to‘ldirish"}
              </span>
              <strong>{completionPercent}%</strong>
            </div>
            <div
              className="up-progress"
              role="progressbar"
              aria-label="Profil to‘ldirilishi"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={completionPercent}
            >
              <span style={{ width: `${completionPercent}%` }} />
            </div>
            <div className="up-completion-footer">
              <p>
                {completed} / {completion.length} ta ma’lumot kiritilgan
              </p>
              {nextSection && (
                <button
                  className="up-text-button"
                  type="button"
                  onClick={() => startEditing(nextSection)}
                >
                  Davom ettirish →
                </button>
              )}
            </div>
          </div>
          <h2 className="up-group-title">Hisob ma’lumotlari</h2>
          <div className="up-menu">
            <button
              type="button"
              className="up-menu-row"
              onClick={() => startEditing("info")}
            >
              <span className="up-menu-icon">
                <ProfileIcon name="person" />
              </span>
              <span className="up-menu-copy">
                <strong>Shaxsiy ma’lumotlar</strong>
                <span>
                  {personalCount === 3
                    ? `Tug‘ilgan sana: ${profile.birthDate.split("-").reverse().join(".")}`
                    : `Ism, familiya, tug‘ilgan sana · ${personalCount}/3`}
                </span>
              </span>
              <span className="up-chevron">
                <ProfileIcon name="arrow" />
              </span>
            </button>
            <button
              type="button"
              className="up-menu-row"
              onClick={() => startEditing("phone")}
            >
              <span className="up-menu-icon">
                <ProfileIcon name="phone" />
              </span>
              <span className="up-menu-copy">
                <strong>Telefon raqami</strong>
                <span>{profile.phone || "Raqam kiritilmagan"}</span>
              </span>
              <span className="up-chevron">
                <ProfileIcon name="arrow" />
              </span>
            </button>
            <button
              type="button"
              className="up-menu-row"
              onClick={() => startEditing("location")}
            >
              <span className="up-menu-icon">
                <ProfileIcon name="pin" />
              </span>
              <span className="up-menu-copy">
                <strong>Mening manzilim</strong>
                <span className={hasLocation ? "up-saved-address" : undefined}>
                  {profile.address ||
                    (hasLocation
                      ? "Xaritada belgilangan"
                      : "Yaqin barberlarni topish uchun")}
                </span>
              </span>
              <span className="up-chevron">
                <ProfileIcon name="arrow" />
              </span>
            </button>
          </div>
          {hasLocation && (
            <Link to="/user#nearby" className="up-nearby-link">
              <ProfileIcon name="pin" />
              <span>Yaqin barberlarni ko‘rish</span>
              <span className="up-chevron">
                <ProfileIcon name="arrow" />
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
            <ProfileIcon name="logout" />
            Hisobdan chiqish
          </button>
          <dialog
            ref={logoutDialog}
            className="up-logout-dialog"
            aria-labelledby="up-logout-title"
            aria-describedby="up-logout-description"
          >
            <span className="up-logout-symbol">
              <ProfileIcon name="logout" />
            </span>
            <h2 id="up-logout-title">Hisobdan chiqasizmi?</h2>
            <p id="up-logout-description">
              Joriy sessiyada saqlangan profil o‘zgarishlari tozalanadi.
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
    </section>
  );
}
