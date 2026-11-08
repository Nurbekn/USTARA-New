// Tap the native input directly: mobile browsers need no scripted click.
export default function MediaPicker({ accept, onChange, disabled, className = "", label, children }) {
  return (
    <label className={`bx-media-picker ${className} ${disabled ? "is-disabled" : ""}`}>
      {children}
      <input type="file" accept={accept} onChange={onChange} disabled={disabled} aria-label={label} />
    </label>
  );
}
