import { useRef, useState } from "react";

export default function MediaPicker({ accept, onChange, disabled, className = "", label, children }) {
  const [status, setStatus] = useState("");
  const handledFile = useRef(null);
  // Separate Android's image and video pickers instead of a mixed MIME chooser.
  const types = accept.includes("video/") ? ["image/*", "video/*"] : [accept];

  const select = (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      setStatus("Brauzer faylni qaytarmadi. «Fayllar» orqali telefon xotirasidagi rasmni tanlang.");
      return;
    }
    // Some mobile pickers emit input before change. Process either, once.
    if (handledFile.current === file) return;
    handledFile.current = file;
    setStatus(`Tanlandi: ${file.name || "Fayl"} · ${(file.size / 1024 / 1024).toFixed(1)} MB`);
    onChange(event);
  };

  return (
    <div className={`bx-media-picker ${className} ${disabled ? "is-disabled" : ""}`}>
      {children}
      {types.map((type) => <label key={type} className="bx-native-picker">
        <span>{type.startsWith("video/") ? "Video tanlash" : "Rasm tanlash"}</span>
        <input type="file" accept={type} onInput={select} onChange={select} onCancel={() => setStatus("Fayl tanlanmadi. Qayta tanlashingiz mumkin.")} disabled={disabled} aria-label={`${label}: ${type.startsWith("video/") ? "video" : "rasm"}`} onClick={(event) => {
          event.currentTarget.value = "";
          handledFile.current = null;
          setStatus("Tanlash oynasi ochildi. Faylni belgilab, «Tayyor» yoki «Tanlash»ni bosing.");
        }} />
      </label>)}
      {status && <small className="bx-picker-status" role="status">{status}</small>}
    </div>
  );
}
