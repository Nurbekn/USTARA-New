import { useEffect, useId, useRef } from "react";
import { useLocation } from "react-router-dom";
import { authLocale, authUi } from "../authLocale.js";

export default function CaptchaField({ challenge, value, onChange, onRefresh, error }) {
  const location = useLocation();
  const ui = authUi(authLocale(location.search));
  const id = useId();
  const canvas = useRef(null);

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, 220, 64);
    context.fillStyle = "#e8eef7";
    context.fillRect(0, 0, 220, 64);
    const noise = crypto.getRandomValues(new Uint32Array(100));
    for (let index = 0; index < 8; index++) {
      context.strokeStyle = "#9daec3";
      context.beginPath();
      context.moveTo(noise[index * 4] % 220, noise[index * 4 + 1] % 64);
      context.lineTo(noise[index * 4 + 2] % 220, noise[index * 4 + 3] % 64);
      context.stroke();
    }
    context.font = "bold 32px monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    [...challenge.code].forEach((letter, index) => {
      context.save();
      context.translate(30 + index * 40, 32 + (noise[40 + index] % 9) - 4);
      context.rotate(((noise[50 + index] % 25) - 12) * Math.PI / 180);
      context.fillStyle = "#253b5b";
      context.fillText(letter, 0, 0);
      context.restore();
    });
  }, [challenge]);

  return (
    <div className="au-field au-captcha">
      <label className="au-label" htmlFor={id}>{ui.captcha}</label>
      <div className="au-captcha-image">
        <canvas ref={canvas} width="220" height="64" role="img" aria-label={ui.captchaDescription} />
        <button type="button" className="au-text-btn au-captcha-refresh" onClick={onRefresh} aria-label={ui.captchaRefresh}>↻ {ui.refresh}</button>
      </div>
      <input id={id} className={`au-input${error ? " has-error" : ""}`} type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={5} placeholder={ui.captchaPlaceholder} value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} aria-invalid={!!error} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} />
      <p className="au-captcha-hint" id={`${id}-hint`}>{ui.captchaHint}</p>
      {error && <p className="au-error" id={`${id}-error`} role="alert">{error}</p>}
    </div>
  );
}
