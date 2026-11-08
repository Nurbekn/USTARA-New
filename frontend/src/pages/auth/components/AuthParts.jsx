import { Link } from "react-router-dom";
import { formatPhone } from "../utils/phone";

// Page shell shared by every auth screen: back link, logo, card.
export function AuthLayout({ children, wide = false, className = "" }) {
  return (
    <div className={`au-page ${wide ? "is-wide" : ""} ${className}`}>
      <header className="au-top">
        <Link to="/" className="au-back">
          ← Bosh sahifa
        </Link>
        <Link to="/" className="au-logo" aria-label="Ustara">
          USTARA<span>.</span>
        </Link>
      </header>
      <main className="au-card">{children}</main>
    </div>
  );
}

// "Mijoz | Usta" switch at the top of both sign-up pages
export function RoleSwitch({ role }) {
  return (
    <nav className="au-seg" aria-label="Hisob turi">
      <Link to="/signup" className={role === "customer" ? "is-active" : ""} aria-current={role === "customer" ? "page" : undefined}>
        Mijoz
      </Link>
      <Link to="/signup/usta" className={role === "barber" ? "is-active" : ""} aria-current={role === "barber" ? "page" : undefined}>
        Sartarosh
      </Link>
    </nav>
  );
}

// Phone input with the +998 prefix and live formatting: "90 123 4567"
export function PhoneField({ id = "phone", value, onChange, error }) {
  return (
    <div className="au-field">
      <label className="au-label" htmlFor={id}>
        Telefon raqam
      </label>
      <div className={`au-phone ${error ? "has-error" : ""}`}>
        <span className="au-prefix">
          <b>UZ</b> +998
        </span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="90 123 4567"
          value={value}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(formatPhone(event.target.value))}
        />
      </div>
      {error && (
        <p className="au-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
