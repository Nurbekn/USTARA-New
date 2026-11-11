import { useRef, useState } from "react";
import ProfilePhotoField from "./ProfilePhotoField";
import Sheet from "./Sheet";

function PhotoEditor({ value, name, onSave, onClose, onSaved, onBusyChange, errorClassName }) {
  const busy = useRef(false);
  const [error, setError] = useState("");

  function changePhoto(avatarPhoto) {
    setError("");
    try {
      if (onSave(avatarPhoto) === false) throw new Error("Photo could not be saved");
    } catch {
      setError("Rasm saqlanmadi. Brauzer xotirasini tekshirib, qayta urinib ko‘ring.");
      return;
    }
    busy.current = false;
    onBusyChange?.(false);
    onClose();
    onSaved?.(avatarPhoto);
  }

  return (
    <Sheet compact open title="Profil rasmi" onClose={() => { if (!busy.current) onClose(); }}>
      <ProfilePhotoField
        compact
        value={value}
        name={name}
        onBusyChange={(uploading) => { busy.current = uploading; onBusyChange?.(uploading); }}
        onChange={changePhoto}
      />
      {error && <p className={errorClassName} role="alert">{error}</p>}
    </Sheet>
  );
}

export default function ProfilePhotoSheet({ open, errorClassName = "profile-photo-error", ...props }) {
  // Mount a fresh editor on each opening so old upload errors cannot persist.
  return open ? <PhotoEditor {...props} errorClassName={errorClassName} /> : null;
}
