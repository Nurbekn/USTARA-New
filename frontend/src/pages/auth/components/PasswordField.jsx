import { useEffect, useRef, useState } from "react";

export default function PasswordField({ value, onChange, error, signup = false, confirmation = false, matchState = null }) {
  const [visible, setVisible] = useState(false);
  const [lastTyped, setLastTyped] = useState(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  function hideLastCharacter() {
    window.clearTimeout(timerRef.current);
    setLastTyped(null);
  }

  function changePassword(event) {
    const next = event.target.value;
    const { inputType, data } = event.nativeEvent;
    const caret = event.target.selectionStart;
    hideLastCharacter();
    // Reveal only a newly typed character; pasted and autofilled values stay masked.
    if (!visible && inputType === "insertText" && caret > 0
      && (data ? Array.from(data).length === 1 : next.length > value.length)) {
      setLastTyped({ index: caret - 1, value: next });
      timerRef.current = window.setTimeout(() => setLastTyped(null), 600);
    }
    setScrollLeft(event.target.scrollLeft);
    onChange(next);
  }

  const maskedValue = Array.from(value).map((character, index) => (
    lastTyped?.value === value && lastTyped.index === index ? character : "•"
  )).join("");
  const inputId = confirmation ? "confirm-password" : "password";
  const descriptions = [
    error ? `${inputId}-error` : null,
    signup && !confirmation ? `${inputId}-hint` : null,
    confirmation && matchState && !error ? `${inputId}-match` : null,
  ].filter(Boolean).join(" ") || undefined;
  const label = confirmation ? "Parolni takrorlang" : signup ? "Parol yarating" : "Parol";
  return (
    <div className="au-field">
      <label className="au-label" htmlFor={inputId}>{label}</label>
      <div className={`au-password${error ? " has-error" : ""}${matchState ? ` is-${matchState}` : ""}`}>
        <div className="au-password-entry">
          <input id={inputId} name={inputId} className={visible ? "" : "au-password-concealed"} type={visible ? "text" : "password"} autoComplete={signup || confirmation ? "new-password" : "current-password"} autoCapitalize="none" spellCheck={false} value={value} onChange={changePassword} onBlur={hideLastCharacter} onPaste={hideLastCharacter} onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)} aria-invalid={!!error || matchState === "mismatch"} aria-describedby={descriptions} />
          {!visible && <span className="au-password-mask" aria-hidden="true"><span style={{ transform: `translateX(-${scrollLeft}px)` }}>{maskedValue}</span></span>}
        </div>
        <button type="button" aria-label={visible ? "Parolni yashirish" : "Parolni ko‘rsatish"} aria-pressed={visible} onClick={() => { hideLastCharacter(); setVisible((previous) => !previous); }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible && <path d="m3 3 18 18" />}</svg>
        </button>
      </div>
      {signup && !confirmation && <p className="au-password-hint" id={`${inputId}-hint`}>Kamida 8 ta raqam va kamida 1 ta lotin harfi. Tinish belgisi ixtiyoriy.</p>}
      {confirmation && !error && <p className={`au-password-match${matchState ? ` is-${matchState}` : ""}`} id={`${inputId}-match`} aria-live="polite">{matchState === "match" ? "Parollar mos." : matchState === "mismatch" ? "Parollar mos emas." : ""}</p>}
      {error && <p className="au-error" id={`${inputId}-error`} role="alert">{error}</p>}
    </div>
  );
}
