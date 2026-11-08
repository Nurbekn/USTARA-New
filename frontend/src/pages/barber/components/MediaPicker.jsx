import { useState } from "react";

export default function MediaPicker({ accept, onChange, disabled, className = "", label, children }) {
  const [status, setStatus] = useState("");

  const select = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setStatus("Fayl tanlanmadi.");
      return;
    }
    setStatus(`Tanlandi: ${file.name || "Fayl"} · ${(file.size / 1024 / 1024).toFixed(1)} MB`);
    onChange(event);
  };

  return (
    <div className={`bx-media-picker ${className} ${disabled ? "is-disabled" : ""}`}>
      {children}
      <label className="bx-native-picker">
        <span>Rasm tanlash</span>
        <input type="file" accept={accept} onChange={select} disabled={disabled} aria-label={label} />
      </label>
      {status && <small className="bx-picker-status" role="status">{status}</small>}
    </div>
  );
}
