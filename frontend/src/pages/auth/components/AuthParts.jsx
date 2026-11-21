import BrandLogo from "../../../components/brand/BrandLogo";
import ArrowIcon from "../../../components/ArrowIcon";
import { Link, useLocation } from "react-router-dom";
import SiteLanguageSelect from "../../../components/SiteLanguageSelect.jsx";
import { siteLocalePath } from "../../../utils/siteLocale.js";
import { authLocale, authUi } from "../authLocale.js";
import { formatPhone } from "../utils/phone";

// Page shell shared by every auth screen: back link, logo, card.
export function AuthLayout({ children, wide = false, className = "" }) {
  const location = useLocation();
  const lang = authLocale(location.search);
  const ui = authUi(lang);
  return (
    <div className={`au-page ${wide ? "is-wide" : ""} ${className}`}>
      <header className="au-top">
        <Link to={siteLocalePath("/", lang)} className="au-back">
          <ArrowIcon direction="left" /> {ui.home}
        </Link>
        <SiteLanguageSelect className="au-language" />
        <Link to={siteLocalePath("/", lang)} className="au-logo" aria-label="Ustara">
          <BrandLogo />
        </Link>
      </header>
      <main className="au-card">{children}</main>
    </div>
  );
}

// "Mijoz | Sartarosh" switch at the top of both sign-up pages
export function RoleSwitch({ role }) {
  const location = useLocation();
  const lang = authLocale(location.search);
  const ui = authUi(lang);
  return (
    <nav className="au-seg" aria-label={ui.role}>
      <Link to={siteLocalePath("/signup", lang)} className={role === "customer" ? "is-active" : ""} aria-current={role === "customer" ? "page" : undefined}>
        {ui.customer}
      </Link>
      <Link to={siteLocalePath("/signup/sartarosh", lang)} className={role === "barber" ? "is-active" : ""} aria-current={role === "barber" ? "page" : undefined}>
        {ui.barber}
      </Link>
    </nav>
  );
}

// Phone input with the +998 prefix and live formatting: "90 123 4567"
export function PhoneField({ id = "phone", value, onChange, error }) {
  const location = useLocation();
  const ui = authUi(authLocale(location.search));
  return (
    <div className="au-field">
      <label className="au-label" htmlFor={id}>
        {ui.phone}
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
