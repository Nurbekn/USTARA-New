// Keep the native control visible, including the selected filename on Android.
export default function MediaPicker({ accept, onChange, disabled, className = "", label, children }) {
  return (
    <div className={`bx-media-picker ${className} ${disabled ? "is-disabled" : ""}`}>
      {children}
      <input type="file" accept={accept} onChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}
