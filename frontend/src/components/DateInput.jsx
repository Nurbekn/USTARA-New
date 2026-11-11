import { useId, useState } from "react";
import { formatDate, parseDateInput } from "../utils/format";

export default function DateInput({ value = "", onChange, ...props }) {
  const id = useId();
  const [text, setText] = useState(() => value ? formatDate(value) : "");
  const [touched, setTouched] = useState(false);
  const invalid = text !== "" && !parseDateInput(text);
  const message = invalid ? "Sanani DD/MM/YYYY shaklida to‘g‘ri kiriting." : "";

  function change(event) {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
    const next = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("/");
    setText(next);
    if (!next) onChange("");
    else {
      const iso = parseDateInput(next);
      if (iso) onChange(iso);
    }
  }

  return (
    <>
      <input {...props} type="text" inputMode="numeric" placeholder="DD/MM/YYYY" maxLength={10}
        value={text} onChange={change} onBlur={() => setTouched(true)}
        ref={(input) => input?.setCustomValidity(message)}
        aria-invalid={touched && !!invalid} aria-describedby={touched && invalid ? id : undefined} />
      {touched && invalid && <span id={id} className="up-error" role="alert">{message}</span>}
    </>
  );
}
